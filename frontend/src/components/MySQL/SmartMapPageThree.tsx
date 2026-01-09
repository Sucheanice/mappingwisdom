import React, { useEffect, useRef, useState } from 'react';
import { OpenAPI } from '@/client';
import { Card, Row, Col, Button, Space, Typography, message, Input, Divider } from 'antd';
import { 
  EnvironmentOutlined, 
  ZoomInOutlined, 
  ZoomOutOutlined, 
  ReloadOutlined,
  SearchOutlined,
  PlusOutlined,
  MinusOutlined,
  AimOutlined,
  DeleteOutlined,
  ToolOutlined,
  EditOutlined as DrawIcon,
  EyeOutlined,
  EyeInvisibleOutlined,
  StopOutlined
} from '@ant-design/icons';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import { fromLonLat, toLonLat } from 'ol/proj';
import { defaults as defaultControls, FullScreen, ScaleLine } from 'ol/control';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import { Style, Circle as StyleCircle, Fill, Stroke, Text as OlText } from 'ol/style';
import { Draw, Modify } from 'ol/interaction';
import Snap from 'ol/interaction/Snap';
import { getLength, getArea } from 'ol/sphere';
import 'ol/ol.css';

const { Title, Text } = Typography;

interface MapMarker {
  id: string;
  name: string;
  coordinate: [number, number];
  description?: string;
}

const SmartMapPageThree: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  
  // 新增状态
  const [currentLayer, setCurrentLayer] = useState('osm');
  const [drawMode, setDrawMode] = useState<string | null>(null);
  const [clearMode, setClearMode] = useState<string | null>(null);
  const [, setDrawings] = useState<any[]>([]);
  const [measurements, setMeasurements] = useState<Array<{id: string, type: string, value: string, geometry: any}>>([]);
  const [layerVisibility, setLayerVisibility] = useState<{[key: string]: boolean}>({
    osm: true,
    satellite: false,
    terrain: false,
    markers: true,
    drawings: true
  });

  // WebSocket连接状态
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // 构建 API base URL
  const getApiBase = () => {
    let apiBase = OpenAPI.BASE || window.location.origin
    // 修复端口：如果使用了错误的端口（8000），替换为正确的端口（8009）
    if (apiBase.includes(':8000')) {
      apiBase = apiBase.replace(':8000', ':8009')
    }
    // 如果当前页面在 5173 端口，后端应该在 8009 端口
    if (window.location.origin.includes(':5173') && !apiBase.includes(':8009')) {
      apiBase = window.location.origin.replace(':5173', ':8009')
    }
    return apiBase
  }

  const apiBase = getApiBase()

  // 设置地图光标样式
  const setCursor = (cursor: string) => {
    if (mapInstanceRef.current) {
      const el = mapInstanceRef.current.getTargetElement();
      if (el) el.style.cursor = cursor;
    }
  };

  // WebSocket连接
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        // 构建 WebSocket URL
        const wsUrl = apiBase.replace(/^http/, 'ws') + '/api/v1/ws/map'
        const ws = new WebSocket(wsUrl);
        console.log('🔗 正在连接 WebSocket:', wsUrl);
        
        ws.onopen = () => {
          console.log('✅ WebSocket连接已建立');
          setWsConnection(ws);
          setWsConnected(true);
          message.success('实时同步已连接');
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📨 收到WebSocket消息:', data);
            
            if (data.type === 'map_state_sync' || data.type === 'map_state_update') {
              handleMapAction(data);
            }
          } catch (error) {
            console.error('解析WebSocket消息失败:', error);
          }
        };
        
        ws.onclose = () => {
          console.log('❌ WebSocket连接已断开');
          setWsConnection(null);
          setWsConnected(false);
          message.warning('实时同步已断开，正在重连...');
          
          // 5秒后重连
          setTimeout(connectWebSocket, 5000);
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket错误:', error);
          setWsConnected(false);
        };
        
      } catch (error) {
        console.error('WebSocket连接失败:', error);
        setWsConnected(false);
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (wsConnection) {
        wsConnection.close();
      }
    };
  }, [apiBase]);

  // 处理WebSocket地图操作
  const handleMapAction = (data: any) => {
    console.log('📨 收到WebSocket消息:', data);
    
    if (data.type === 'map_state_sync') {
      // 完整状态同步
      console.log('🔄 同步完整地图状态:', data.state);
      syncMapState(data.state);
    } else if (data.type === 'map_state_update') {
      // 增量状态更新
      console.log('🔄 增量更新地图状态:', data.event, data.data);
      handleStateUpdate(data.event, data.data);
    }
  };

  // 同步完整地图状态
  const syncMapState = (state: any) => {
    if (mapInstanceRef.current) {
      const view = mapInstanceRef.current.getView();
      view.animate({
        center: fromLonLat(state.center),
        zoom: state.zoom,
        duration: 1000
      });
      
      // 更新标记点
      setMarkers(state.markers || []);
      
      // 更新绘制图形
      setDrawings(state.drawings || []);
      
      // 更新测量结果
      setMeasurements(state.measurements || []);
      
      // 同步当前图层状态
      if (state.current_layer) {
        setCurrentLayer(state.current_layer);
        console.log('🔄 同步图层状态:', state.current_layer);
        
        // 实际切换地图图层
        const layers = mapInstanceRef.current.getLayers();
        
        // 隐藏所有底图图层
        layers.forEach((layer, index) => {
          if (index < 3) { // 前3个是底图图层
            layer.setVisible(false);
          }
        });
        
        // 显示选中的图层
        switch (state.current_layer) {
          case 'osm':
            if (layers.getArray()[0]) {
              layers.getArray()[0].setVisible(true);
            }
            break;
          case 'satellite':
            if (layers.getArray()[1]) {
              layers.getArray()[1].setVisible(true);
            }
            break;
          case 'terrain':
            if (layers.getArray()[2]) {
              layers.getArray()[2].setVisible(true);
            }
            break;
        }
      }
      
      message.success('地图状态已同步');
    }
  };

  // 从后端加载初始地图状态
  const loadInitialMapState = async () => {
    try {
      console.log('🔍 从后端加载初始地图状态...');
      const response = await fetch(`${apiBase}/api/v1/map/state`);
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ 获取到初始地图状态:', result.state);
        syncMapState(result.state);
        
        // 同步当前图层状态
        if (result.state.current_layer) {
          setCurrentLayer(result.state.current_layer);
          console.log('🔄 同步当前图层:', result.state.current_layer);
        }
      } else {
        console.log('❌ 获取初始地图状态失败:', result.message);
      }
    } catch (error) {
      console.error('❌ 加载初始地图状态失败:', error);
    }
  };

  // 处理增量状态更新
  const handleStateUpdate = (event: string, data: any) => {
    switch (event) {
      case 'center_updated':
        if (mapInstanceRef.current) {
          const view = mapInstanceRef.current.getView();
          view.animate({
            center: fromLonLat(data.center),
            zoom: data.zoom,
            duration: 1000
          });
        }
        break;
      case 'layer_switch':
        // 处理图层切换
        if (mapInstanceRef.current) {
          const layerType = data.layer_id;
          const layers = mapInstanceRef.current.getLayers();
          setCurrentLayer(layerType);
          
          // 隐藏所有底图图层
          layers.forEach((layer, index) => {
            if (index < 3) { // 前3个是底图图层
              layer.setVisible(false);
            }
          });
          
          // 显示选中的图层
          switch (layerType) {
            case 'osm':
              if (layers.getArray()[0]) {
                layers.getArray()[0].setVisible(true);
              }
              break;
            case 'satellite':
              if (layers.getArray()[1]) {
                layers.getArray()[1].setVisible(true);
              }
              break;
            case 'terrain':
              if (layers.getArray()[2]) {
                layers.getArray()[2].setVisible(true);
              }
              break;
          }
          
          message.success(`实时同步: 已切换到${data.layer_name}`);
        }
        break;
      case 'marker':
        if (data.action === 'added') {
          setMarkers(prev => [...prev, data.marker]);
        } else if (data.action === 'removed') {
          setMarkers(prev => prev.filter(m => m.id !== data.marker.id));
        }
        break;
      case 'drawing_added':
        setDrawings(prev => [...prev, data]);
        break;
      case 'measurement_added':
        setMeasurements(prev => [...prev, data]);
        break;
      case 'cleared':
        if (data.type === 'all') {
          setMarkers([]);
          setDrawings([]);
          setMeasurements([]);
        } else if (data.type === 'markers') {
          setMarkers([]);
        } else if (data.type === 'drawings') {
          setDrawings([]);
        } else if (data.type === 'measurements') {
          setMeasurements([]);
        }
        break;
    }
  };

  // ESC键取消绘制/测量/清除（绑定在window，避免焦点问题）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (drawMode) {
          stopDrawing();
          message.info('已取消当前操作');
        } else if (clearMode) {
          stopClearing();
          message.info('已取消清除模式');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawMode, clearMode]);

  // 监听标记点变化，更新地图显示
  useEffect(() => {
    if (!vectorSourceRef.current || !mapInstanceRef.current) return;
    
    // 清除现有标记点
    vectorSourceRef.current.clear();
    
    // 添加所有标记点到地图
    markers.forEach(marker => {
      const feature = new Feature({
        geometry: new Point(fromLonLat(marker.coordinate)),
        name: marker.name,
        description: marker.description
      });
      
      feature.setStyle(new Style({
        image: new StyleCircle({
          radius: 8,
          fill: new Fill({ color: '#ff0000' }),
          stroke: new Stroke({ color: '#ffffff', width: 2 })
        }),
        text: new OlText({
          text: '📍',
          scale: 1.5,
          offsetY: -20
        })
      }));
      
      vectorSourceRef.current!.addFeature(feature);
    });
  }, [markers]);

  // 初始化地图
  useEffect(() => {
    if (!mapRef.current) return;

    try {
      // 创建矢量源用于标记点
      const vectorSource = new VectorSource();
      vectorSourceRef.current = vectorSource;

      // 创建矢量图层
      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: new Style({
          image: new StyleCircle({
            radius: 8,
            fill: new Fill({ color: '#ff0000' }),
            stroke: new Stroke({ color: '#ffffff', width: 2 })
          }),
          text: new OlText({
            text: '📍',
            scale: 1.5,
            offsetY: -20
          })
        })
      });

      // 创建绘制图层
      const drawingsSource = new VectorSource();
      const drawingsLayer = new VectorLayer({
        source: drawingsSource,
        style: new Style({
          fill: new Fill({ color: 'rgba(255, 255, 0, 0.2)' }),
          stroke: new Stroke({ color: '#ff0000', width: 2 })
        })
      });

      // 创建测量图层
      const measurementsSource = new VectorSource();
      const measurementsLayer = new VectorLayer({
        source: measurementsSource,
        style: new Style({
          fill: new Fill({ color: 'rgba(0, 255, 0, 0.2)' }),
          stroke: new Stroke({ color: '#00ff00', width: 2 })
        })
      });

      // 创建地图实例
      const map = new Map({
        target: mapRef.current,
        layers: [
          // 底图图层
          new TileLayer({
            source: new OSM(),
            visible: layerVisibility.osm
          }),
          new TileLayer({
            source: new XYZ({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              crossOrigin: 'anonymous'
            }),
            visible: layerVisibility.satellite
          }),
          new TileLayer({
            source: new XYZ({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
              crossOrigin: 'anonymous'
            }),
            visible: layerVisibility.terrain
          }),
          // 功能图层
          vectorLayer,
          drawingsLayer,
          measurementsLayer
        ],
        view: new View({
          center: fromLonLat([116.3974, 39.9093]), // 北京
          zoom: 10
        }),
        controls: defaultControls().extend([
          new FullScreen(),
          new ScaleLine()
        ])
      });

      mapInstanceRef.current = map;

      // 默认拖动手势光标
      setCursor('grab');
      map.on('pointerdrag', () => setCursor('grabbing'));
      map.on('moveend', () => setCursor('grab'));

      // 禁用地图容器右键菜单，避免误触发
      const targetEl = map.getTargetElement();
      if (targetEl) {
        targetEl.addEventListener('contextmenu', (e) => e.preventDefault());
      }

      // 从后端加载初始地图状态
      loadInitialMapState();

      // 地图左键点击事件
      map.on('click', (event) => {
        // 仅在清除模式下处理点击；默认不再添加标记点，保持拖动为主
        if (event.originalEvent && 'button' in event.originalEvent && event.originalEvent.button === 0) {
          if (clearMode) {
            handleClearClick(event);
          }
        }
      });

      // 地图移动事件
      map.getView().on('change:center', () => {
        const center = toLonLat(map.getView().getCenter()!);
        console.log('地图中心:', center);
      });

      setMapLoaded(true);
      message.success('OpenLayers地图加载成功！');

    } catch (error) {
      console.error('地图初始化失败:', error);
      message.error('地图初始化失败，请检查OpenLayers配置');
    }

    // 清理函数
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 添加标记点
  const addMarker = (name: string, coordinate: [number, number], description?: string) => {
    if (!vectorSourceRef.current || !mapInstanceRef.current) return;

    const marker: MapMarker = {
      id: Date.now().toString(),
      name,
      coordinate,
      description
    };

    // 创建OpenLayers要素
    const feature = new Feature({
      geometry: new Point(fromLonLat(coordinate)),
      name: name,
      description: description
    });

    // 设置样式
    feature.setStyle(new Style({
      image: new StyleCircle({
        radius: 8,
        fill: new Fill({ color: '#ff0000' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
      }),
      text: new OlText({
        text: '📍',
        scale: 1.5,
        offsetY: -20
      })
    }));

    vectorSourceRef.current.addFeature(feature);
    setMarkers(prev => [...prev, marker]);

    // 同步到后端（便于 Dify 访问与后续分析）
    try {
      fetch(`${apiBase}/api/v1/map/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_marker',
          data: { marker }
        })
      }).catch(() => {});
    } catch {}
  };

  // 获取当前位置
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      message.error('浏览器不支持地理定位');
      return;
    }

    message.loading('正在获取位置...', 0);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;
        const coordinate: [number, number] = [longitude, latitude];
        
        setCurrentLocation(coordinate);
        
        if (mapInstanceRef.current) {
          const view = mapInstanceRef.current.getView();
          view.setCenter(fromLonLat(coordinate));
          view.setZoom(15);
        }
        
        addMarker('我的位置', coordinate, '当前位置');
        message.destroy();
        message.success('位置获取成功！');
      },
      (error) => {
        message.destroy();
        message.error('位置获取失败: ' + error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // 搜索位置 - 使用后端API
  const searchLocation = async () => {
    if (!searchValue.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }

    message.loading('正在搜索位置...', 0);

    try {
      // 先调用后端搜索 API，获取候选结果
      const searchResp = await fetch(`${apiBase}/api/v1/map/search?query=${encodeURIComponent(searchValue)}&limit=1`);
      if (!searchResp.ok) throw new Error('搜索服务暂时不可用');
      const searchJson = await searchResp.json();

      console.log('🔎 搜索结果:', searchJson);

      if (!searchJson || !searchJson.count || searchJson.count === 0) {
        message.destroy();
        message.warning('未找到匹配位置，请尝试更精确的关键词');
        return;
      }

      const top = searchJson.results[0];
      const locateName = top.name || searchValue;

      // 再调用定位 API（后端将返回动画与可选标记）
      const locateResp = await fetch(`${apiBase}/api/v1/map/locate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: locateName,
          zoom: 15,
          add_marker: true,
          marker_name: locateName
        })
      });
      if (!locateResp.ok) throw new Error('定位服务暂时不可用');
      const result = await locateResp.json();

      console.log('📍 定位结果:', result);

      if (result.success) {
        if (mapInstanceRef.current) {
          const view = mapInstanceRef.current.getView();
          view.animate({
            center: fromLonLat(result.map_instructions.center),
            zoom: result.map_instructions.zoom,
            duration: result.map_instructions.animation.duration
          });
        }
        if (result.marker) {
          addMarker(result.marker.name, result.marker.coordinate, result.marker.description);
        }
        message.destroy();
        message.success(result.message || '已定位');
      } else {
        message.destroy();
        message.error('定位失败: ' + (result.message || '未知错误'));
      }
    } catch (error) {
      message.destroy();
      console.error('搜索错误:', error);
      
      // 如果API调用失败，回退到本地搜索
      const localResults = [
        { name: '成都', coordinate: [104.0668, 30.5728] as [number, number] },
        { name: '北京', coordinate: [116.3974, 39.9093] as [number, number] },
        { name: '上海', coordinate: [121.4737, 31.2304] as [number, number] },
        { name: '广州', coordinate: [113.2644, 23.1291] as [number, number] },
        { name: '深圳', coordinate: [114.0579, 22.5431] as [number, number] },
        { name: '杭州', coordinate: [120.1551, 30.2741] as [number, number] },
        { name: '西安', coordinate: [108.9402, 34.3416] as [number, number] },
        { name: '武汉', coordinate: [114.3054, 30.5928] as [number, number] }
      ];

      const result = localResults.find(item => 
        item.name.includes(searchValue) || searchValue.includes(item.name)
      );

      if (result) {
        if (mapInstanceRef.current) {
          const view = mapInstanceRef.current.getView();
          view.animate({
            center: fromLonLat(result.coordinate),
            zoom: 15,
            duration: 1000
          });
        }
        addMarker(result.name, result.coordinate, `搜索到: ${result.name}`);
        message.success(`已定位到: ${result.name} (本地数据)`);
      } else {
        message.error('搜索失败，请检查网络连接或尝试其他关键词');
      }
    }
  };

  // 地图控制函数
  const zoomIn = () => {
    if (mapInstanceRef.current) {
      const view = mapInstanceRef.current.getView();
      view.animate({ zoom: view.getZoom()! + 1, duration: 300 });
    }
  };

  const zoomOut = () => {
    if (mapInstanceRef.current) {
      const view = mapInstanceRef.current.getView();
      view.animate({ zoom: view.getZoom()! - 1, duration: 300 });
    }
  };

  const resetView = () => {
    if (mapInstanceRef.current) {
      const view = mapInstanceRef.current.getView();
      view.animate({
        center: fromLonLat([116.3974, 39.9093]),
        zoom: 10,
        duration: 1000
      });
    }
  };

  const clearMarkers = () => {
    if (vectorSourceRef.current) {
      vectorSourceRef.current.clear();
      setMarkers([]);
      message.success('已清除所有标记点');

      // 同步到后端
      try {
        fetch(`${apiBase}/api/v1/map/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear_markers' })
        }).catch(() => {});
      } catch {}
    }
  };

  // 图层切换功能
  const switchLayer = (layerType: string) => {
    if (!mapInstanceRef.current) return;
    
    const layers = mapInstanceRef.current.getLayers();
    setCurrentLayer(layerType);
    
    // 隐藏所有底图图层
    layers.forEach((layer, index) => {
      if (index < 3) { // 前3个是底图图层
        layer.setVisible(false);
      }
    });
    
    // 显示选中的图层
    try {
      switch (layerType) {
        case 'osm':
          if (layers.getArray()[0]) {
            layers.getArray()[0].setVisible(true);
          }
          break;
        case 'satellite':
          if (layers.getArray()[1]) {
            layers.getArray()[1].setVisible(true);
          }
          break;
        case 'terrain':
          if (layers.getArray()[2]) {
            layers.getArray()[2].setVisible(true);
          }
          break;
      }
      
      message.success(`已切换到${layerType === 'osm' ? '街道地图' : layerType === 'satellite' ? '卫星地图' : '地形地图'}`);
    } catch (error) {
      console.error('图层切换失败:', error);
      message.error('图层切换失败，请重试');
    }
  };

  // 绘制功能
  const startDrawing = (drawType: string) => {
    if (!mapInstanceRef.current) return;
    
    // 清除之前的绘制交互
    const interactions = mapInstanceRef.current.getInteractions();
    interactions.forEach(interaction => {
      if (interaction instanceof Draw || interaction instanceof Modify) {
        mapInstanceRef.current!.removeInteraction(interaction);
      }
    });
    
    const drawingsLayer = mapInstanceRef.current.getLayers().getArray()[3] as VectorLayer<Feature>;
    const drawingsSource = drawingsLayer.getSource() as VectorSource;
    
    let drawInteraction: Draw;
    switch (drawType) {
      case 'point':
        drawInteraction = new Draw({
          source: drawingsSource,
          type: 'Point'
        });
        break;
      case 'line':
        drawInteraction = new Draw({
          source: drawingsSource,
          type: 'LineString'
        });
        break;
      case 'polygon':
        drawInteraction = new Draw({
          source: drawingsSource,
          type: 'Polygon'
        });
        break;
      case 'circle':
        drawInteraction = new Draw({
          source: drawingsSource,
          type: 'Circle'
        });
        break;
      default:
        return;
    }
    
    mapInstanceRef.current.addInteraction(drawInteraction);
    setDrawMode(drawType);
    setCursor('crosshair');
    message.success(`开始绘制${drawType === 'point' ? '点' : drawType === 'line' ? '线' : drawType === 'polygon' ? '多边形' : '圆形'}`);
    
    // 绘制完成事件
    drawInteraction.on('drawend', () => {
      setDrawMode(null);
      message.success('绘制完成');

      // 从绘制图层中获取最新新增的要素并尝试序列化基本信息
      try {
        const drawingsLayer = mapInstanceRef.current!.getLayers().getArray()[3] as VectorLayer<Feature>;
        const drawingsSource = drawingsLayer.getSource() as VectorSource;
        const features = drawingsSource.getFeatures();
        const last = features[features.length - 1];
        if (last) {
          const geometry = last.getGeometry();
          const type = geometry?.getType();
          let serialized: any = { id: Date.now().toString(), type: '', coordinates: [] };
          if (type === 'Point') {
            serialized.type = 'point';
            // @ts-ignore
            serialized.coordinates = [toLonLat(geometry.getCoordinates())];
          } else if (type === 'LineString') {
            serialized.type = 'line';
            // @ts-ignore
            serialized.coordinates = geometry.getCoordinates().map((c: any) => toLonLat(c));
          } else if (type === 'Polygon') {
            serialized.type = 'polygon';
            // @ts-ignore
            const rings = geometry.getCoordinates()[0] || [];
            serialized.coordinates = (rings as any[]).map((c: any) => toLonLat(c));
          } else if (type === 'Circle') {
            serialized.type = 'circle';
            // Circle 序列化为中心+近似边界点
            // @ts-ignore
            const center = toLonLat(geometry.getCenter());
            serialized.coordinates = [center];
          }

          fetch(`${apiBase}/api/v1/map/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_drawing', data: { drawing: serialized } })
          }).catch(() => {});
        }
      } catch {}
    });
  };

  // 停止绘制/测量
  const stopDrawing = () => {
    if (!mapInstanceRef.current) return;
    
    const interactions = mapInstanceRef.current.getInteractions();
    interactions.forEach(interaction => {
      if (interaction instanceof Draw) {
        mapInstanceRef.current!.removeInteraction(interaction);
      }
    });
    
    setDrawMode(null);
    message.info('已停止当前操作');
    setCursor('grab');
  };

  // 开始清除模式
  const startClearing = (clearType: string) => {
    if (!mapInstanceRef.current) return;
    
    // 先停止其他模式
    if (drawMode) {
      stopDrawing();
    }
    
    setClearMode(clearType);
    message.success(`开始清除${clearType === 'markers' ? '标记点' : clearType === 'drawings' ? '绘制图形' : '测量结果'}`);
    setCursor('pointer');
  };

  // 停止清除模式
  const stopClearing = () => {
    setClearMode(null);
    message.info('已退出清除模式');
    setCursor('grab');
  };

  // 清除所有内容
  const clearAll = () => {
    if (!mapInstanceRef.current) return;
    
    try {
      // 清除标记点
      if (vectorSourceRef.current) {
        vectorSourceRef.current.clear();
        setMarkers([]);
      }
      
      // 清除绘制图形
      const drawingsLayer = mapInstanceRef.current.getLayers().getArray()[4] as VectorLayer<Feature>;
      const drawingsSource = drawingsLayer.getSource() as VectorSource;
      drawingsSource.clear();
      
      // 清除测量结果
      const measurementsLayer = mapInstanceRef.current.getLayers().getArray()[5] as VectorLayer<Feature>;
      const measurementsSource = measurementsLayer.getSource() as VectorSource;
      measurementsSource.clear();
      setMeasurements([]);
      
      message.success('已清除所有内容');

      // 同步到后端
      try {
        fetch(`${apiBase}/api/v1/map/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear_all' })
        }).catch(() => {});
      } catch {}
    } catch (error) {
      console.error('清除失败:', error);
      message.error('清除失败，请重试');
    }
  };

  // 处理清除点击
  const handleClearClick = (event: any) => {
    if (!mapInstanceRef.current) return;
    
    const coordinate = event.coordinate;
    let cleared = false;
    
    try {
      if (clearMode === 'markers' && vectorSourceRef.current) {
        // 清除标记点
        const features = vectorSourceRef.current.getFeatures();
        features.forEach(feature => {
          const geometry = feature.getGeometry();
          if (geometry && geometry.getType() === 'Point') {
            const featureCoord = (geometry as Point).getCoordinates();
            const distance = Math.sqrt(
              Math.pow(coordinate[0] - featureCoord[0], 2) + 
              Math.pow(coordinate[1] - featureCoord[1], 2)
            );
            if (distance < 100) { // 100像素范围内
              vectorSourceRef.current!.removeFeature(feature);
              cleared = true;
            }
          }
        });
      } else if (clearMode === 'drawings') {
        // 清除绘制图形
        const drawingsLayer = mapInstanceRef.current.getLayers().getArray()[4] as VectorLayer<Feature>;
        const drawingsSource = drawingsLayer.getSource() as VectorSource;
        const features = drawingsSource.getFeatures();
        features.forEach(feature => {
          const geometry = feature.getGeometry();
          if (geometry) {
            const extent = geometry.getExtent();
            if (coordinate[0] >= extent[0] && coordinate[0] <= extent[2] && 
                coordinate[1] >= extent[1] && coordinate[1] <= extent[3]) {
              drawingsSource.removeFeature(feature);
              cleared = true;
            }
          }
        });
      } else if (clearMode === 'measurements') {
        // 清除测量结果
        const measurementsLayer = mapInstanceRef.current.getLayers().getArray()[5] as VectorLayer<Feature>;
        const measurementsSource = measurementsLayer.getSource() as VectorSource;
        const features = measurementsSource.getFeatures();
        features.forEach(feature => {
          const geometry = feature.getGeometry();
          if (geometry) {
            const extent = geometry.getExtent();
            if (coordinate[0] >= extent[0] && coordinate[0] <= extent[2] && 
                coordinate[1] >= extent[1] && coordinate[1] <= extent[3]) {
              measurementsSource.removeFeature(feature);
              cleared = true;
            }
          }
        });
      }
      
      if (cleared) {
        message.success('已清除点击的要素');
      } else {
        message.info('未找到可清除的要素');
      }
    } catch (error) {
      console.error('清除点击失败:', error);
      message.error('清除失败，请重试');
    }
  };

  // 测量功能
  const startMeasuring = (measureType: string) => {
    if (!mapInstanceRef.current) return;
    
    const measurementsLayer = mapInstanceRef.current.getLayers().getArray()[4] as VectorLayer<Feature>;
    const measurementsSource = measurementsLayer.getSource() as VectorSource;
    
    let drawInteraction: Draw;
    if (measureType === 'length') {
      drawInteraction = new Draw({
        source: measurementsSource,
        type: 'LineString'
      });
    } else {
      drawInteraction = new Draw({
        source: measurementsSource,
        type: 'Polygon'
      });
    }
    
    mapInstanceRef.current.addInteraction(drawInteraction);
    // 添加吸附，避免最后一个点回到第一个点时自交产生异常面积
    const snap = new Snap({ source: measurementsSource });
    mapInstanceRef.current.addInteraction(snap);
    setDrawMode(`measure_${measureType}`);
    setCursor('crosshair');
    
    drawInteraction.on('drawend', (event) => {
      const feature = event.feature;
      const geometry = feature.getGeometry();
      
      let value: string;
      if (measureType === 'length') {
        const length = getLength(geometry as LineString);
        value = length > 1000 ? `${(length / 1000).toFixed(2)} km` : `${length.toFixed(2)} m`;
      } else {
        const area = getArea(geometry as Polygon);
        value = area > 10000 ? `${(area / 10000).toFixed(2)} 公顷` : `${area.toFixed(2)} 平方米`;
      }
      
      const measurement = {
        id: Date.now().toString(),
        type: measureType,
        value,
        geometry: feature
      };
      
      setMeasurements(prev => [...prev, measurement]);
      message.success(`测量完成: ${value}`);
      setDrawMode(null);
      setCursor('grab');
      // 清除吸附交互，避免后续模式下叠加
      if (mapInstanceRef.current) {
        mapInstanceRef.current.getInteractions().forEach(interaction => {
          if (interaction instanceof Snap) {
            mapInstanceRef.current!.removeInteraction(interaction);
          }
        });
      }

      // 同步测量结果到后端
      try {
        let serialized: any = { id: Date.now().toString(), type: '', coordinates: [], value };
        if (measureType === 'length') {
          serialized.type = 'length';
          // @ts-ignore
          serialized.coordinates = (geometry as LineString).getCoordinates().map((c: any) => toLonLat(c));
        } else {
          serialized.type = 'area';
          // @ts-ignore
          const rings = (geometry as Polygon).getCoordinates()[0] || [];
          serialized.coordinates = (rings as any[]).map((c: any) => toLonLat(c));
        }
        fetch(`${apiBase}/api/v1/map/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_measurement', data: { measurement: serialized } })
        }).catch(() => {});
      } catch {}
    });
  };

  // 清除测量
  const clearMeasurements = () => {
    if (!mapInstanceRef.current) return;
    
    try {
      const measurementsLayer = mapInstanceRef.current.getLayers().getArray()[5] as VectorLayer<Feature>;
      const measurementsSource = measurementsLayer.getSource() as VectorSource;
      measurementsSource.clear();
      setMeasurements([]);
      message.success('已清除所有测量结果');

      // 同步到后端
      try {
        fetch(`${apiBase}/api/v1/map/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear_measurements' })
        }).catch(() => {});
      } catch {}
    } catch (error) {
      console.error('清除测量失败:', error);
      message.error('清除测量失败，请重试');
    }
  };

  // 图层可见性切换
  const toggleLayerVisibility = (layerName: string) => {
    if (!mapInstanceRef.current) return;
    
    const layers = mapInstanceRef.current.getLayers();
    const newVisibility = !layerVisibility[layerName];
    
    setLayerVisibility(prev => ({
      ...prev,
      [layerName]: newVisibility
    }));
    
    switch (layerName) {
      case 'markers':
        layers.getArray()[3].setVisible(newVisibility);
        break;
      case 'drawings':
        layers.getArray()[4].setVisible(newVisibility);
        break;
      case 'measurements':
        layers.getArray()[5].setVisible(newVisibility);
        break;
    }
    
    message.success(`${layerName}图层已${newVisibility ? '显示' : '隐藏'}`);
  };

  // API地图定位功能
  const locateToCity = async (cityName: string) => {
    try {
      message.loading(`正在定位到${cityName}...`, 0);
      
      // 先搜索，确认名称与可达性
      const searchResp = await fetch(`${apiBase}/api/v1/map/search?query=${encodeURIComponent(cityName)}&limit=1`);
      if (!searchResp.ok) throw new Error('搜索服务暂时不可用');
      const searchJson = await searchResp.json();

      if (!searchJson || !searchJson.count || searchJson.count === 0) {
        message.destroy();
        message.warning('未找到目标位置，请更换关键词');
        return;
      }

      const locateName = (searchJson.results[0] && searchJson.results[0].name) || cityName;

      // 再定位
      const response = await fetch(`${apiBase}/api/v1/map/locate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: locateName,
          zoom: 15,
          add_marker: true,
          marker_name: locateName
        })
      });
      const result = await response.json();
      
      if (result.success) {
        // 执行地图移动动画
        if (mapInstanceRef.current) {
          const view = mapInstanceRef.current.getView();
          view.animate({
            center: fromLonLat(result.map_instructions.center),
            zoom: result.map_instructions.zoom,
            duration: result.map_instructions.animation.duration
          });
        }
        
        // 如果返回了标记点信息，添加到地图
        if (result.marker) {
          addMarker(result.marker.name, result.marker.coordinate, result.marker.description);
        }
        
        message.destroy();
        message.success(result.message);
      } else {
        message.destroy();
        message.error('定位失败: ' + (result.message || '未知错误'));
      }
    } catch (error) {
      message.destroy();
      message.error('定位失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div style={{ padding: '24px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Card style={{ marginBottom: '16px' }}>
        <Title level={2}>
          <EnvironmentOutlined style={{ marginRight: '8px' }} />
          智慧地图V3 - OpenLayers版
        </Title>
        <Text type="secondary">
          基于OpenLayers和OpenStreetMap的交互式地图，支持标记、搜索、定位等功能
        </Text>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
          💡 提示：按 ESC 键可取消当前操作 | 右键不会标记点 | 使用清除工具删除要素
        </div>
        <div style={{ marginTop: '4px', fontSize: '12px', color: wsConnected ? '#52c41a' : '#ff4d4f' }}>
          🔗 实时同步: {wsConnected ? '已连接' : '未连接'}
        </div>
      </Card>

		<Row gutter={16} style={{ flex: 1, minHeight: 0 }}>
			{/* 左侧：地图 + 控制模块（控制在地图下方） */}
			<Col span={16}>
				<Card 
					title="地图视图" 
					style={{ marginBottom: '16px' }}
					extra={
						<Space>
							<Button 
								icon={<ZoomInOutlined />} 
								onClick={zoomIn}
								disabled={!mapLoaded}
							>
								放大
							</Button>
							<Button 
								icon={<ZoomOutOutlined />} 
								onClick={zoomOut}
								disabled={!mapLoaded}
							>
								缩小
							</Button>
							<Button 
								icon={<ReloadOutlined />} 
								onClick={resetView}
								disabled={!mapLoaded}
							>
								重置
							</Button>
							<Button 
								icon={<AimOutlined />} 
								onClick={getCurrentLocation}
								disabled={!mapLoaded}
							>
								定位
							</Button>
						</Space>
					}
				>
            <div 
						ref={mapRef} 
						style={{ 
							width: '100%', 
							height: '600px',
							border: '1px solid #d9d9d9',
							borderRadius: '6px'
              }}
              onContextMenu={(e) => e.preventDefault()}
					/>
					{!mapLoaded && (
						<div style={{ 
							position: 'absolute', 
							top: '50%', 
							left: '50%', 
							transform: 'translate(-50%, -50%)',
							fontSize: '16px',
							color: '#666'
						}}>
							地图加载中...
						</div>
					)}
				</Card>

				{/* 地图控制模块（移动到地图下方） */}
				<Card title="地图控制" style={{ marginBottom: '16px' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>搜索位置</Text>
                <Input.Search
                  placeholder="输入城市名或地址（如：成都、北京天安门）"
                  value={searchValue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchValue(e.target.value)}
                  onSearch={searchLocation}
                  enterButton={<SearchOutlined />}
                  disabled={!mapLoaded}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  支持搜索：城市名、具体地址、地标建筑等
                </div>
                
                <Divider style={{ margin: '12px 0' }} />
                
                <Text strong>快速定位（API调用）</Text>
                <div style={{ marginTop: '8px' }}>
                  <Space wrap>
                    <Button 
                      size="small" 
                      onClick={() => locateToCity('成都')}
                      disabled={!mapLoaded}
                    >
                      成都
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => locateToCity('北京天安门')}
                      disabled={!mapLoaded}
                    >
                      天安门
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => locateToCity('上海外滩')}
                      disabled={!mapLoaded}
                    >
                      外滩
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => locateToCity('深圳')}
                      disabled={!mapLoaded}
                    >
                      深圳
                    </Button>
                  </Space>
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  点击按钮通过API自动定位到指定城市
                </div>
              </div>
              
              <Divider />
              
              <div>
                <Text strong>标记点管理</Text>
                <Space direction="vertical" style={{ width: '100%', marginTop: '8px' }}>
                  <Button 
                    icon={<PlusOutlined />} 
                    onClick={() => {
                      const name = prompt('请输入标记点名称:');
                      if (name) {
                        const center = mapInstanceRef.current?.getView().getCenter();
                        if (center) {
                          const coordinate = toLonLat(center) as [number, number];
                          addMarker(name, coordinate);
                        }
                      }
                    }}
                    disabled={!mapLoaded}
                    block
                  >
                    添加标记点
                  </Button>
                  <Button 
                    icon={<MinusOutlined />} 
                    onClick={clearMarkers}
                    disabled={!mapLoaded || markers.length === 0}
                    block
                  >
                    清除标记
                  </Button>
                </Space>
              </div>

              <Divider />

              <div>
                <Text strong>图层切换</Text>
                <Space direction="vertical" style={{ width: '100%', marginTop: '8px' }}>
                  <Button 
                    type={currentLayer === 'osm' ? 'primary' : 'default'}
                    onClick={() => switchLayer('osm')}
                    disabled={!mapLoaded}
                    block
                  >
                    街道地图
                  </Button>
                  <Button 
                    type={currentLayer === 'satellite' ? 'primary' : 'default'}
                    onClick={() => switchLayer('satellite')}
                    disabled={!mapLoaded}
                    block
                  >
                    卫星地图
                  </Button>
                  <Button 
                    type={currentLayer === 'terrain' ? 'primary' : 'default'}
                    onClick={() => switchLayer('terrain')}
                    disabled={!mapLoaded}
                    block
                  >
                    地形地图
                  </Button>
                </Space>
              </div>

              <Divider />

              <div>
                <Text strong>绘制工具</Text>
                <Space direction="vertical" style={{ width: '100%', marginTop: '8px' }}>
                  <Button 
                    icon={<DrawIcon />}
                    type={drawMode === 'point' ? 'primary' : 'default'}
                    onClick={() => startDrawing('point')}
                    disabled={!mapLoaded}
                    block
                  >
                    绘制点
                  </Button>
                  <Button 
                    icon={<DrawIcon />}
                    type={drawMode === 'line' ? 'primary' : 'default'}
                    onClick={() => startDrawing('line')}
                    disabled={!mapLoaded}
                    block
                  >
                    绘制线
                  </Button>
                  <Button 
                    icon={<DrawIcon />}
                    type={drawMode === 'polygon' ? 'primary' : 'default'}
                    onClick={() => startDrawing('polygon')}
                    disabled={!mapLoaded}
                    block
                  >
                    绘制多边形
                  </Button>
                  <Button 
                    icon={<DrawIcon />}
                    type={drawMode === 'circle' ? 'primary' : 'default'}
                    onClick={() => startDrawing('circle')}
                    disabled={!mapLoaded}
                    block
                  >
                    绘制圆形
                  </Button>
                  {drawMode && (
                    <Button 
                      icon={<StopOutlined />}
                      onClick={stopDrawing}
                      type="dashed"
                      block
                    >
                      停止{drawMode.startsWith('measure_') ? '测量' : '绘制'} (ESC)
                    </Button>
                  )}
                </Space>
              </div>

              <Divider />

              <div>
                <Text strong>清除工具</Text>
                <Space direction="vertical" style={{ width: '100%', marginTop: '8px' }}>
                  <Button 
                    icon={<DeleteOutlined />}
                    type={clearMode === 'markers' ? 'primary' : 'default'}
                    onClick={() => startClearing('markers')}
                    disabled={!mapLoaded || markers.length === 0}
                    block
                  >
                    清除标记点
                  </Button>
                  <Button 
                    icon={<DeleteOutlined />}
                    type={clearMode === 'drawings' ? 'primary' : 'default'}
                    onClick={() => startClearing('drawings')}
                    disabled={!mapLoaded}
                    block
                  >
                    清除绘制图形
                  </Button>
                  <Button 
                    icon={<DeleteOutlined />}
                    type={clearMode === 'measurements' ? 'primary' : 'default'}
                    onClick={() => startClearing('measurements')}
                    disabled={!mapLoaded || measurements.length === 0}
                    block
                  >
                    清除测量结果
                  </Button>
                  <Button 
                    icon={<DeleteOutlined />}
                    onClick={clearAll}
                    disabled={!mapLoaded}
                    danger
                    block
                  >
                    清除所有内容
                  </Button>
                  {clearMode && (
                    <Button 
                      icon={<StopOutlined />}
                      onClick={stopClearing}
                      type="dashed"
                      block
                    >
                      退出清除模式 (ESC)
                    </Button>
                  )}
                </Space>
              </div>

              <Divider />

              <div>
                <Text strong>测量工具</Text>
                <Space direction="vertical" style={{ width: '100%', marginTop: '8px' }}>
                  <Button 
                    icon={<ToolOutlined />}
                    type={drawMode === 'measure_length' ? 'primary' : 'default'}
                    onClick={() => startMeasuring('length')}
                    disabled={!mapLoaded}
                    block
                  >
                    测量距离
                  </Button>
                  <Button 
                    icon={<ToolOutlined />}
                    type={drawMode === 'measure_area' ? 'primary' : 'default'}
                    onClick={() => startMeasuring('area')}
                    disabled={!mapLoaded}
                    block
                  >
                    测量面积
                  </Button>
                  <Button 
                    icon={<DeleteOutlined />}
                    onClick={clearMeasurements}
                    disabled={!mapLoaded || measurements.length === 0}
                    block
                  >
                    清除测量结果
                  </Button>
                  {(drawMode === 'measure_length' || drawMode === 'measure_area') && (
                    <Button 
                      icon={<StopOutlined />}
                      onClick={stopDrawing}
                      type="dashed"
                      block
                    >
                      停止测量 (ESC)
                    </Button>
                  )}
                </Space>
              </div>

              <Divider />

              <div>
                <Text strong>图层控制</Text>
                <Space direction="vertical" style={{ width: '100%', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>标记点</Text>
                    <Button 
                      icon={layerVisibility.markers ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                      onClick={() => toggleLayerVisibility('markers')}
                      size="small"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>绘制图形</Text>
                    <Button 
                      icon={layerVisibility.drawings ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                      onClick={() => toggleLayerVisibility('drawings')}
                      size="small"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>测量结果</Text>
                    <Button 
                      icon={layerVisibility.measurements ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                      onClick={() => toggleLayerVisibility('measurements')}
                      size="small"
                    />
                  </div>
                </Space>
              </div>

              <Divider />

              <div>
                <Text strong>地图信息</Text>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  <div>状态: {mapLoaded ? '已加载' : '加载中'}</div>
                  <div>标记点: {markers.length} 个</div>
                  <div>测量结果: {measurements.length} 个</div>
                  {currentLocation && (
                    <div>
                      当前位置: {currentLocation[0].toFixed(4)}, {currentLocation[1].toFixed(4)}
                    </div>
                  )}
                </div>
              </div>
            </Space>
				</Card>

				<Card title="标记点列表" size="small" style={{ marginBottom: '16px' }}>
            {markers.length === 0 ? (
              <Text type="secondary">暂无标记点</Text>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {markers.map((marker) => (
                  <div 
                    key={marker.id}
                    style={{ 
                      padding: '8px', 
                      border: '1px solid #f0f0f0', 
                      borderRadius: '4px',
                      marginBottom: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      if (mapInstanceRef.current) {
                        const view = mapInstanceRef.current.getView();
                        view.animate({
                          center: fromLonLat(marker.coordinate),
                          zoom: 15,
                          duration: 500
                        });
                      }
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                      {marker.name}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666' }}>
                      {marker.coordinate[0].toFixed(4)}, {marker.coordinate[1].toFixed(4)}
                    </div>
                    {marker.description && (
                      <div style={{ fontSize: '10px', color: '#999' }}>
                        {marker.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

				<Card title="测量结果" size="small">
            {measurements.length === 0 ? (
              <Text type="secondary">暂无测量结果</Text>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {measurements.map((measurement) => (
                  <div 
                    key={measurement.id}
                    style={{ 
                      padding: '8px', 
                      border: '1px solid #f0f0f0', 
                      borderRadius: '4px',
                      marginBottom: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      if (mapInstanceRef.current) {
                        const geometry = measurement.geometry.getGeometry();
                        const extent = geometry.getExtent();
                        const view = mapInstanceRef.current.getView();
                        view.fit(extent, { padding: [20, 20, 20, 20] });
                      }
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#00ff00' }}>
                      {measurement.type === 'length' ? '距离测量' : '面积测量'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {measurement.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
			</Col>

			{/* 右侧：AI 对话面板（与地图视图等高） */}
			<Col span={8}>
				<Card title="AI 对话" bodyStyle={{ padding: 0 }}>
					<div style={{ width: '100%', height: '600px' }}>
						<iframe
							src="http://localhost/chatbot/5chgDhqbfLVz0F2y"
							style={{ width: '100%', height: '100%', minHeight: '700px', border: '0' }}
							frameBorder={0}
							allow="microphone"
						/>
					</div>
				</Card>
			</Col>
      </Row>
    </div>
  );
};

export default SmartMapPageThree;
