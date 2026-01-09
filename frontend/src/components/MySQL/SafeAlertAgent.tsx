import React, { useEffect, useRef, useState } from 'react';
import { OpenAPI } from '@/client';
import { Card, Row, Col, Button, Space, Typography, message, Input, Divider, Select, Tag, notification } from 'antd';
import { 
  EnvironmentOutlined, 
  ZoomInOutlined, 
  ZoomOutOutlined, 
  ReloadOutlined,
  SearchOutlined,
  SafetyOutlined,
  UserOutlined,
  CloudOutlined,
  BellOutlined,
  EyeOutlined,
  EyeInvisibleOutlined
} from '@ant-design/icons';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultControls, FullScreen, ScaleLine } from 'ol/control';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Circle as StyleCircle, Fill, Stroke, Text as OlText } from 'ol/style';
// import { Draw, Modify } from 'ol/interaction'; // 未使用
// import { getLength, getArea } from 'ol/sphere'; // 未使用
import 'ol/ol.css';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

interface LocationReport {
  id: number;
  user_id: number;
  username: string;
  nickname: string;
  latitude: number;
  longitude: number;
  province: string;
  city: string;
  district: string;
  address: string;
  accuracy: number;
  source: string;
  device: string;
  ip_address: string;
  remark: string;
  create_time: string;
  weather_info?: {
    城市?: string;
    天气?: string;
    "温度(℃)"?: string;
    风向?: string;
    风力?: string;
    "湿度(%)"?: string;
    报告时间?: string;
  };
  weather_time?: string;
}

interface MapMarker {
  id: string;
  name: string;
  coordinate: [number, number];
  description?: string;
  report?: LocationReport;
}

const SafeAlertAgent: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const [, setMapLoaded] = useState(false);
  const [locationReports, setLocationReports] = useState<LocationReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<LocationReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [showMarkers, setShowMarkers] = useState(true);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [, setSelectedMarker] = useState<MapMarker | null>(null);
  const [updatingWeather, setUpdatingWeather] = useState(false);
  const [showWeatherLayer, setShowWeatherLayer] = useState(false);
  const [weatherLayer, setWeatherLayer] = useState<any>(null);
  const [sendingNotifications, setSendingNotifications] = useState<Set<number>>(new Set());
  const [simulatingWeather, setSimulatingWeather] = useState(false);
  const [simulationMode, setSimulationMode] = useState('normal');
  const [isSimulationEnabled, setIsSimulationEnabled] = useState(false);
  const [weatherAlerts, setWeatherAlerts] = useState<any[]>([]);
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);
  const [refreshTimer, setRefreshTimer] = useState<ReturnType<typeof setInterval> | null>(null);
  const [websocketStatus, setWebsocketStatus] = useState<string>('未连接');

  // WebSocket连接
  const connectWebSocket = () => {
    if (websocket) {
      websocket.close();
    }
    
    // 构建 WebSocket URL，使用 OpenAPI.BASE 或当前页面的 origin
    let wsBase = OpenAPI.BASE || window.location.origin
    // 修复端口：如果使用了错误的端口（8000），替换为正确的端口（8009）
    if (wsBase.includes(':8000')) {
      wsBase = wsBase.replace(':8000', ':8009')
    }
    // 转换为 WebSocket URL
    const wsUrl = wsBase.replace(/^http/, 'ws') + '/api/v1/simulation/weather-alerts'
    
    console.log('🔗 正在建立WebSocket连接...');
    console.log('WebSocket URL:', wsUrl);
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('🌐 WebSocket连接已建立');
      setWebsocketStatus('已连接');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 收到WebSocket消息:', data);
        if (data.type === 'weather_alert') {
          console.log('🚨 处理天气预警:', data.data);
          console.log('🎯 预警详情:', {
            位置: data.data.location,
            用户: data.data.nickname || data.data.username,
            预警原因: data.data.alert_reasons,
            预警级别: data.data.alert_level
          });
          handleWeatherAlert(data.data);
        } else if (data.type === 'simulation_status') {
          // 处理模拟状态更新
          console.log('📊 模拟状态更新:', data.data);
        }
      } catch (error) {
        console.error('❌ 解析WebSocket消息失败:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('🌐 WebSocket连接已断开');
      setWebsocketStatus('连接断开');
      // 5秒后重连
      setTimeout(connectWebSocket, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('❌ WebSocket连接错误:', error);
      setWebsocketStatus('连接错误');
    };
    
    setWebsocket(ws);
  };

  // 聚焦到指定位置
  const focusOnLocation = (alertData: any) => {
    console.log('🎯 聚焦到位置:', alertData.location);
    
    if (mapInstanceRef.current) {
      // 根据用户ID获取对应的坐标
      let coordinate: [number, number];
      switch (alertData.user_id) {
        case 1001: // 李强
          coordinate = [111.660000, 40.820000]; // 内蒙古呼和浩特
          break;
        case 1010: // 郑军
          coordinate = [79.930000, 37.120000]; // 新疆喀什
          break;
        case 1008: // 郑兴维
          coordinate = [100.994000, 35.522000]; // 青海共和县
          break;
        default:
          coordinate = [111.660000, 40.820000]; // 默认李强位置
      }
      
      const view = mapInstanceRef.current.getView();
      view.animate({
        center: fromLonLat(coordinate),
        zoom: 10, // 放大到10级，显示地区级别信息
        duration: 1000 // 1秒动画
      });
      
      // 添加一个特殊的聚焦标记点
      if (vectorSourceRef.current) {
        const focusFeature = new Feature({
          geometry: new Point(fromLonLat(coordinate)),
          markerId: 'focus-marker',
          name: `${alertData.nickname || alertData.username} - 预警位置`,
          description: `预警原因: ${alertData.alert_reasons.join('、')}`
        });
        
        // 设置聚焦标记点的特殊样式
        focusFeature.setStyle(new Style({
          image: new StyleCircle({
            radius: 12,
            fill: new Fill({ color: '#ff4d4f' }), // 红色
            stroke: new Stroke({ color: '#fff', width: 3 })
          }),
          text: new OlText({
            text: '🚨',
            font: 'bold 16px Arial',
            fill: new Fill({ color: '#ff4d4f' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
            offsetY: -25,
            textAlign: 'center'
          })
        }));
        
        vectorSourceRef.current.addFeature(focusFeature);
        
        // 3秒后移除聚焦标记点
        setTimeout(() => {
          if (vectorSourceRef.current) {
            const features = vectorSourceRef.current.getFeatures();
            const focusFeature = features.find(f => f.get('markerId') === 'focus-marker');
            if (focusFeature) {
              vectorSourceRef.current.removeFeature(focusFeature);
            }
          }
        }, 3000);
      }
      
      message.success(`已聚焦到 ${alertData.nickname || alertData.username} 所在位置`);
    }
  };

  // 处理天气预警
  const handleWeatherAlert = (alertData: any) => {
    const alertMessage = `⚠️ ${alertData.location}地区天气发生${alertData.alert_reasons.join('、')}变化（影响人员：${alertData.nickname || alertData.username}）`;
    
    console.log('📨 显示预警消息:', alertMessage);
    console.log('🎯 弹窗预警详情:', {
      位置: alertData.location,
      用户: alertData.nickname || alertData.username,
      预警原因: alertData.alert_reasons,
      预警级别: alertData.alert_level,
      完整消息: alertMessage
    });
    
    // 显示预警消息 - 右下角Notification，点击时聚焦到地图位置
    notification.warning({
      message: '天气预警',
      description: alertMessage,
      duration: 10, // 10秒后自动消失
      placement: 'bottomRight', // 右下角位置
      style: {
        maxWidth: '400px',
        wordBreak: 'break-word',
        cursor: 'pointer', // 添加指针样式
      },
      onClick: () => {
        // 点击预警消息时，聚焦到李强所在位置
        focusOnLocation(alertData);
      },
    });
    
    console.log('✅ 预警弹窗已显示');
    
    // 添加到预警列表
    setWeatherAlerts(prev => [alertData, ...prev.slice(0, 19)]); // 保留最近20条
    
    // 自动刷新数据
    fetchLocationReports();
  };

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

  // 获取位置上报数据
  const fetchLocationReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedUser) params.append('username', selectedUser);
      if (selectedSource) params.append('source', selectedSource);
      if (selectedProvince) params.append('province', selectedProvince);

      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/mysql/locations?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setLocationReports(data);
        setFilteredReports(data);
        updateMapMarkers(data);
      } else {
        message.error('获取位置数据失败');
      }
    } catch (error) {
      message.error('网络错误，请检查后端服务是否启动');
      console.error('Error fetching location reports:', error);
    } finally {
      setLoading(false);
    }
  };

  // 更新地图标记点
  const updateMapMarkers = (reports: LocationReport[]) => {
    const newMarkers: MapMarker[] = reports.map(report => ({
      id: `marker-${report.id}`,
      name: report.nickname || report.username, // 优先显示nickname，如果没有则显示username
      coordinate: [report.longitude, report.latitude],
      description: `${report.address || '未知地址'}\n时间: ${dayjs(report.create_time).format('YYYY-MM-DD HH:mm:ss')}`,
      report: report
    }));
    setMarkers(newMarkers);
    addMarkersToMap(newMarkers);
  };

  // 初始化地图
  const initializeMap = () => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            crossOrigin: 'anonymous'
          })
        })
      ],
      view: new View({
        center: fromLonLat([104.0, 30.0]), // 成都中心
        zoom: 6
      }),
      controls: defaultControls().extend([
        new FullScreen(),
        new ScaleLine()
      ])
    });

    // 创建矢量图层用于标记点
    const vectorSource = new VectorSource();
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: new Style({
        image: new StyleCircle({
          radius: 8,
          fill: new Fill({ color: '#ff4d4f' }),
          stroke: new Stroke({ color: '#fff', width: 2 })
        })
      })
    });

    map.addLayer(vectorLayer);
    mapInstanceRef.current = map;
    vectorSourceRef.current = vectorSource;

    // 添加点击事件
    map.on('click', (event) => {
      const features = map.getFeaturesAtPixel(event.pixel);
      if (features.length > 0) {
        const feature = features[0];
        const marker = markers.find(m => m.id === feature.get('markerId'));
        if (marker) {
          setSelectedMarker(marker);
        }
      }
    });

    setMapLoaded(true);
  };

  // 添加标记点到地图
  const addMarkersToMap = (markers: MapMarker[]) => {
    if (!vectorSourceRef.current) return;

    vectorSourceRef.current.clear();

    markers.forEach(marker => {
      const feature = new Feature({
        geometry: new Point(fromLonLat(marker.coordinate)),
        markerId: marker.id
      });

      // 根据数据设置不同的样式
      const report = marker.report;
      let color = '#1890ff'; // 默认蓝色
      let radius = 8;

      if (report) {
        // 根据天气设置颜色和样式
        if (report.weather_info && report.weather_info.天气) {
          const weather = report.weather_info.天气;
          if (weather.includes('晴')) {
            color = '#faad14'; // 晴天 - 橙色
            radius = 10; // 晴天标记点稍大
          } else if (weather.includes('雨')) {
            color = '#1890ff'; // 雨天 - 蓝色
            radius = 9;
          } else if (weather.includes('雪')) {
            color = '#52c41a'; // 雪天 - 绿色
            radius = 9;
          } else if (weather.includes('云') || weather.includes('阴')) {
            color = '#722ed1'; // 多云/阴天 - 紫色
            radius = 8;
          } else {
            color = '#fa8c16'; // 其他天气 - 深橙色
            radius = 8;
          }
        } else {
          // 没有天气信息时，根据精度设置颜色
          if (report.accuracy && report.accuracy <= 10) {
            color = '#52c41a'; // 高精度 - 绿色
            radius = 8;
          } else if (report.accuracy && report.accuracy <= 50) {
            color = '#faad14'; // 中等精度 - 橙色
            radius = 7;
          } else {
            color = '#ff4d4f'; // 低精度 - 红色
            radius = 6;
          }
        }

        // 根据来源设置大小
        if (report.source === 'GPS') {
          radius = 10;
        } else if (report.source === 'browser') {
          radius = 8;
        } else {
          radius = 6;
        }
      }

      // 构建标记点文本（包含天气信息）
      let markerText = marker.name;
      if (report && report.weather_info) {
        const temp = report.weather_info["温度(℃)"] || '';
        const weather = report.weather_info.天气 || '';
        if (temp && weather) {
          markerText = `${marker.name}\n${weather} ${temp}°C`;
        }
      }

      feature.setStyle(new Style({
        image: new StyleCircle({
          radius: radius,
          fill: new Fill({ color: color }),
          stroke: new Stroke({ color: '#fff', width: 2 })
        }),
        text: new OlText({
          text: markerText,
          font: 'bold 11px Arial',
          fill: new Fill({ color: '#000' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
          offsetY: -20,
          textAlign: 'center'
        })
      }));

      vectorSourceRef.current?.addFeature(feature);
    });
  };

  // 搜索功能
  const handleSearch = (value: string) => {
    setSearchText(value);
    if (!value.trim()) {
      setFilteredReports(locationReports);
    } else {
      const filtered = locationReports.filter(report =>
        report.username.toLowerCase().includes(value.toLowerCase()) ||
        report.nickname?.toLowerCase().includes(value.toLowerCase()) ||
        report.address?.toLowerCase().includes(value.toLowerCase()) ||
        report.device?.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredReports(filtered);
      updateMapMarkers(filtered);
    }
  };

  // 筛选功能
  const handleFilter = () => {
    let filtered = locationReports;
    
    // 按用户筛选
    if (selectedUser) {
      filtered = filtered.filter(report => 
        report.username === selectedUser || report.nickname === selectedUser
      );
    }
    
    // 按来源筛选
    if (selectedSource) {
      filtered = filtered.filter(report => report.source === selectedSource);
    }
    
    // 按省份筛选
    if (selectedProvince) {
      filtered = filtered.filter(report => report.province === selectedProvince);
    }
    
    // 应用搜索文本筛选
    if (searchText.trim()) {
      filtered = filtered.filter(report =>
        report.username.toLowerCase().includes(searchText.toLowerCase()) ||
        report.nickname?.toLowerCase().includes(searchText.toLowerCase()) ||
        report.address?.toLowerCase().includes(searchText.toLowerCase()) ||
        report.device?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    
    setFilteredReports(filtered);
    updateMapMarkers(filtered);
    message.success(`筛选完成，找到 ${filtered.length} 条记录`);
  };

  // 重置筛选
  const handleReset = () => {
    setSelectedUser('');
    setSelectedSource('');
    setSelectedProvince('');
    setSearchText('');
    setFilteredReports(locationReports);
    updateMapMarkers(locationReports);
    message.info('筛选条件已重置');
  };

  // 批量更新天气信息
  const updateWeatherInfo = async () => {
    setUpdatingWeather(true);
    try {
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/mysql/locations/batch-update-weather`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        message.success(`天气信息更新完成！成功: ${result.updated_count}，失败: ${result.failed_count}`);
        // 刷新数据
        fetchLocationReports();
      } else {
        message.error('天气信息更新失败');
      }
    } catch (error) {
      message.error('网络错误，请检查后端服务');
      console.error('Error updating weather:', error);
    } finally {
      setUpdatingWeather(false);
    }
  };

  // 启动定时刷新
  const startRefreshTimer = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    const timer = setInterval(() => {
      fetchLocationReports();
    }, 10000); // 每10秒刷新一次
    setRefreshTimer(timer);
  };

  // 停止定时刷新
  const stopRefreshTimer = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      setRefreshTimer(null);
    }
  };

  // 切换模拟天气
  const toggleSimulationWeather = async () => {
    setSimulatingWeather(true);
    try {
      if (!isSimulationEnabled) {
        // 启用实时监控
        const apiBase = getApiBase()
        const response = await fetch(`${apiBase}/api/v1/simulation/toggle`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: simulationMode,
            enabled: true
          })
        });
        
        if (response.ok) {
          await response.json(); // result 未使用
          setIsSimulationEnabled(true);
          message.success(`实时监控已启用，模式: ${simulationMode}，每10秒自动更新`);
          
          // 启动实时监控
          await batchSimulateWeather();
          
          // 启动定时刷新
          startRefreshTimer();
          
          // 写死预警弹窗 - 5秒后弹出user001李强的预警信息
          setTimeout(() => {
            console.log('🎯 触发写死预警弹窗 - 李强');
            const testAlert = {
              report_id: 11,
              user_id: 1001,
              username: 'user001',
              nickname: '李强',
              location: '内蒙古自治区呼和浩特市新城区新华大街38号附近',
              alert_reasons: ['温度变化20.0°C', '出现极端天气', '天气从高温变为暴雨'],
              alert_level: 'extreme',
              timestamp: new Date().toISOString()
            };
            
            console.log('📨 显示写死预警消息:', testAlert);
            handleWeatherAlert(testAlert);
          }, 5000); // 5秒后触发
          
          // 写死预警弹窗 - 10秒后弹出user010郑军的预警信息
          setTimeout(() => {
            console.log('🎯 触发写死预警弹窗 - 郑军');
            const testAlert = {
              report_id: 20,
              user_id: 1010,
              username: 'user010',
              nickname: '郑军',
              location: '新疆喀什地区喀什市解放北路66号',
              alert_reasons: ['温度变化25.0°C', '出现沙尘暴', '天气从晴天变为沙尘暴'],
              alert_level: 'extreme',
              timestamp: new Date().toISOString()
            };
            
            console.log('📨 显示写死预警消息:', testAlert);
            handleWeatherAlert(testAlert);
          }, 10000); // 10秒后触发
          
          // 写死预警弹窗 - 15秒后弹出user08郑兴维的预警信息
          setTimeout(() => {
            console.log('🎯 触发写死预警弹窗 - 郑兴维');
            const testAlert = {
              report_id: 8,
              user_id: 1008,
              username: 'user08',
              nickname: '郑兴维',
              location: '青海省海南州共和县恰卜恰镇环湖东路附近',
              alert_reasons: ['温度变化18.0°C', '出现暴雪', '天气从多云变为暴雪'],
              alert_level: 'extreme',
              timestamp: new Date().toISOString()
            };
            
            console.log('📨 显示写死预警消息:', testAlert);
            handleWeatherAlert(testAlert);
          }, 15000); // 15秒后触发
        } else {
          message.error('启用实时监控失败');
        }
      } else {
        // 禁用实时监控
        const apiBase = getApiBase()
        const response = await fetch(`${apiBase}/api/v1/simulation/toggle`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: 'normal',
            enabled: false
          })
        });
        
        if (response.ok) {
          setIsSimulationEnabled(false);
          message.info('实时监控已禁用，恢复真实天气');
          
          // 停止定时刷新
          stopRefreshTimer();
          
          // 清空实时预警栏的消息
          setWeatherAlerts([]);
          console.log('🧹 已清空实时预警消息');
          
          // 还原位置记录栏的背景颜色（通过清空预警列表自动还原）
          console.log('🎨 位置记录栏背景颜色已还原');
        } else {
          message.error('禁用实时监控失败');
        }
      }
    } catch (error) {
      console.error('切换实时监控失败:', error);
      message.error('切换实时监控失败');
    } finally {
      setSimulatingWeather(false);
    }
  };

  // 启动实时监控
  const batchSimulateWeather = async () => {
    try {
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/simulation/reports/batch-simulate-weather`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        message.success(`实时监控启动完成！监控: ${result.updated_count}条，预警: ${result.alert_count}条`);
        // 刷新数据
        fetchLocationReports();
      } else {
        message.error('启动实时监控失败');
      }
    } catch (error) {
      console.error('启动实时监控失败:', error);
      message.error('启动实时监控失败');
    }
  };

  // 发送通知（短信）
  const sendNotification = async (report: any) => {
    const reportId = report.id;
    setSendingNotifications(prev => new Set(prev).add(reportId));
    
    try {
      // 调用短信发送API
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/sms/send-location-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report_id: reportId
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        message.success(result.message || `已向 ${report.nickname || report.username} 发送位置通知`);
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || '发送通知失败');
      }
    } catch (error) {
      console.error('发送通知失败:', error);
      message.error('网络错误，发送通知失败');
    } finally {
      setSendingNotifications(prev => {
        const newSet = new Set(prev);
        newSet.delete(reportId);
        return newSet;
      });
    }
  };

  // 地图操作
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
        center: fromLonLat([104.0, 30.0]),
        zoom: 6,
        duration: 1000
      });
    }
  };

  const toggleMarkers = () => {
    setShowMarkers(!showMarkers);
    if (vectorSourceRef.current) {
      if (showMarkers) {
        vectorSourceRef.current.clear();
      } else {
        addMarkersToMap(filteredReports.map(report => ({
          id: `marker-${report.id}`,
          name: report.username,
          coordinate: [report.longitude, report.latitude],
          description: `${report.address || '未知地址'}\n时间: ${dayjs(report.create_time).format('YYYY-MM-DD HH:mm:ss')}`,
          report: report
        })));
      }
    }
  };

  // 切换天气图层
  const toggleWeatherLayer = () => {
    if (!mapInstanceRef.current) return;
    
    if (showWeatherLayer) {
      // 移除天气图层
      if (weatherLayer) {
        mapInstanceRef.current.removeLayer(weatherLayer);
        setWeatherLayer(null);
      }
      message.info('天气图层已关闭');
    } else {
      // 创建天气效果覆盖层（使用半透明云层效果）
      const weatherOverlay = new TileLayer({
        source: new XYZ({
          url: 'https://t{0-3}.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk=你的天地图key',
          crossOrigin: 'anonymous'
        }),
        opacity: 0.3,
        zIndex: 1
      });
      
      // 如果天地图不可用，使用简单的云层效果（备用，当前未使用）
      // const simpleWeatherLayer = new TileLayer({
      //   source: new XYZ({
      //     url: 'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=你的OpenWeatherMap_key',
      //     crossOrigin: 'anonymous'
      //   }),
      //   opacity: 0.5,
      //   zIndex: 1
      // });
      
      // 添加天气图层
      try {
        mapInstanceRef.current.addLayer(weatherOverlay);
        setWeatherLayer(weatherOverlay);
        message.success('天气图层已开启，显示云层效果');
      } catch (error) {
        // 如果外部API不可用，显示提示信息
        message.warning('天气图层需要配置API密钥，当前显示增强的标记点天气信息');
        setShowWeatherLayer(true); // 仍然标记为开启状态
      }
    }
    
    setShowWeatherLayer(!showWeatherLayer);
  };

  useEffect(() => {
    initializeMap();
    fetchLocationReports();
    connectWebSocket();
    
    return () => {
      if (websocket) {
        websocket.close();
      }
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, []);

  // 获取来源标签颜色
  const getSourceTagColor = (source: string) => {
    switch (source?.toLowerCase()) {
      case 'gps': return 'green';
      case 'browser': return 'blue';
      case 'wifi': return 'orange';
      case '基站': return 'purple';
      default: return 'default';
    }
  };

  // 获取精度标签
  const getAccuracyTag = (accuracy: number) => {
    if (!accuracy) return <Tag color="default">未知</Tag>;
    if (accuracy <= 10) return <Tag color="green">高精度</Tag>;
    if (accuracy <= 50) return <Tag color="blue">中等</Tag>;
    return <Tag color="orange">低精度</Tag>;
  };

  return (
    <div style={{ padding: '24px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Title level={2} style={{ marginBottom: '24px' }}>
        <SafetyOutlined style={{ marginRight: '8px', color: '#ff4d4f' }} />
        安全提醒智能体
      </Title>

      <Row gutter={16} style={{ flex: 1, minHeight: 0 }}>
        {/* 地图区域 */}
        <Col span={16}>
          <Card 
            title="位置监控地图" 
            style={{ height: 'calc(100vh - 200px)' }}
            extra={
              <Space>
                <Button icon={<ZoomInOutlined />} onClick={zoomIn} size="small" />
                <Button icon={<ZoomOutOutlined />} onClick={zoomOut} size="small" />
                <Button icon={<ReloadOutlined />} onClick={resetView} size="small" />
                <Button 
                  icon={showMarkers ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
                  onClick={toggleMarkers} 
                  size="small"
                />
                <Button 
                  icon={<CloudOutlined />} 
                  onClick={toggleWeatherLayer} 
                  size="small"
                  type={showWeatherLayer ? 'primary' : 'default'}
                  title={showWeatherLayer ? '隐藏天气图层' : '显示天气图层'}
                />
                <Button icon={<ReloadOutlined />} onClick={fetchLocationReports} loading={loading} size="small" />
              </Space>
            }
          >
            <div 
              ref={mapRef} 
              style={{ 
                width: '100%', 
                height: 'calc(100vh - 300px)', 
                border: '1px solid #d9d9d9',
                borderRadius: '6px'
              }} 
            />
          </Card>
        </Col>

        {/* 控制面板 */}
        <Col span={8}>
          <Card title="控制面板" style={{ height: 'calc(100vh - 200px)' }}>
            {/* 搜索和筛选 */}
            <Space direction="vertical" style={{ width: '100%', marginBottom: '16px' }}>
              <Input
                placeholder="搜索用户、地址或设备"
                allowClear
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
                onPressEnter={(e: React.KeyboardEvent<HTMLInputElement>) => handleSearch((e.target as HTMLInputElement).value)}
                prefix={<SearchOutlined />}
              />
              
              <Select
                placeholder="选择用户"
                allowClear
                value={selectedUser || undefined}
                onChange={setSelectedUser}
                style={{ width: '100%' }}
                notFoundContent="暂无用户数据"
              >
                {Array.from(new Set(locationReports.map(r => r.username))).map(username => (
                  <Option key={username} value={username}>{username}</Option>
                ))}
              </Select>

              <Select
                placeholder="选择来源"
                allowClear
                value={selectedSource || undefined}
                onChange={setSelectedSource}
                style={{ width: '100%' }}
                notFoundContent="暂无来源数据"
              >
                {Array.from(new Set(locationReports.map(r => r.source).filter(Boolean))).map(source => (
                  <Option key={source} value={source}>{source}</Option>
                ))}
              </Select>

              <Select
                placeholder="选择省份"
                allowClear
                value={selectedProvince || undefined}
                onChange={setSelectedProvince}
                style={{ width: '100%' }}
                notFoundContent="暂无省份数据"
              >
                {Array.from(new Set(locationReports.map(r => r.province).filter(Boolean))).map(province => (
                  <Option key={province} value={province}>{province}</Option>
                ))}
              </Select>

              {/* 模拟天气模式选择 */}
              {!isSimulationEnabled && (
                <Select
                  placeholder="选择模拟模式"
                  value={simulationMode}
                  onChange={setSimulationMode}
                  style={{ width: '100%' }}
                >
                  <Option value="normal">正常模式</Option>
                  <Option value="extreme">极端模式</Option>
                  <Option value="test">测试模式</Option>
                </Select>
              )}

              <Space>
                <Button type="primary" onClick={handleFilter} loading={loading}>
                  筛选
                </Button>
                <Button onClick={handleReset}>
                  重置
                </Button>
                <Button 
                  type="default" 
                  icon={<CloudOutlined />} 
                  onClick={updateWeatherInfo} 
                  loading={updatingWeather}
                >
                  更新天气
                </Button>
                <Button
                  type={isSimulationEnabled ? "primary" : "default"}
                  icon={<CloudOutlined />}
                  onClick={toggleSimulationWeather}
                  loading={simulatingWeather}
                >
                  {isSimulationEnabled ? '禁用监控' : '实时监控'}
                </Button>
              </Space>
            </Space>

            <Divider />

            {/* 实时监控状态显示 */}
            {isSimulationEnabled && (
              <div style={{ marginBottom: '12px' }}>
                <Tag color="orange" style={{ marginBottom: '8px' }}>
                  📡 监控模式: {simulationMode === 'normal' ? '标准' : simulationMode === 'extreme' ? '高敏感' : '测试'}
                </Tag>
                <Tag color="green" style={{ marginBottom: '8px' }}>
                  🔄 实时数据同步中
                </Tag>
                <Tag color={websocketStatus === '已连接' ? 'green' : 'red'} style={{ marginBottom: '8px' }}>
                  🌐 WebSocket: {websocketStatus}
                </Tag>
                <Tag color="purple" style={{ marginBottom: '8px' }}>
                  📊 预警: {weatherAlerts.length}条
                </Tag>
              </div>
            )}

            {/* 天气预警历史 */}
            {weatherAlerts.length > 0 && (
              <div style={{ marginBottom: '12px', height: '140px' }}>
                <Text strong style={{ color: '#ff4d4f' }}>⚠️ 实时预警 ({weatherAlerts.length})</Text>
                <div style={{ height: '120px', overflowY: 'auto', marginTop: '8px' }}>
                  {weatherAlerts.slice(0, 5).map((alert, index) => (
                    <div 
                      key={index} 
                      style={{ 
                        fontSize: '11px', 
                        padding: '4px 8px', 
                        marginBottom: '4px', 
                        backgroundColor: '#fff2f0', 
                        border: '1px solid #ffccc7',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => {
                        console.log('🎯 点击预警历史项，聚焦到位置');
                        focusOnLocation(alert);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffe7e6';
                        e.currentTarget.style.borderColor = '#ff4d4f';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#fff2f0';
                        e.currentTarget.style.borderColor = '#ffccc7';
                      }}
                    >
                      <div style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
                        {alert.location}
                      </div>
                      <div style={{ color: '#666' }}>
                        {alert.alert_reasons.join('、')} - {alert.nickname || alert.username}
                      </div>
                      <div style={{ color: '#999', fontSize: '10px', marginTop: '2px' }}>
                        💡 点击聚焦到地图位置
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 统计信息 - 紧凑显示 */}
            <div style={{ marginBottom: '12px' }}>
              <Space size="large" style={{ width: '100%', justifyContent: 'space-around' }}>
                <Space size={4}>
                  <EnvironmentOutlined style={{ color: '#1890ff' }} />
                  <Text strong style={{ color: '#1890ff' }}>总位置数</Text>
                  <Text strong style={{ color: '#1890ff' }}>{filteredReports.length}</Text>
                </Space>
                <Space size={4}>
                  <UserOutlined style={{ color: '#52c41a' }} />
                  <Text strong style={{ color: '#52c41a' }}>活跃用户</Text>
                  <Text strong style={{ color: '#52c41a' }}>{new Set(filteredReports.map(r => r.username)).size}</Text>
                </Space>
              </Space>
            </div>

            <Divider />

            {/* 位置列表 */}
            <div>
              <Title level={5}>位置记录</Title>
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {filteredReports.map(report => {
                  // 检查该用户是否在预警列表中
                  const hasAlert = weatherAlerts.some(alert => 
                    alert.user_id === report.user_id || 
                    alert.username === report.username ||
                    alert.nickname === report.nickname
                  );
                  
                  return (
                    <Card 
                      key={report.id} 
                      size="small" 
                      style={{ 
                        marginBottom: '8px', 
                        cursor: 'pointer',
                        backgroundColor: hasAlert ? '#fff2f0' : '#fff',
                        borderColor: hasAlert ? '#ff4d4f' : '#d9d9d9',
                        borderWidth: hasAlert ? '2px' : '1px'
                      }}
                      onClick={() => {
                        if (mapInstanceRef.current) {
                          const view = mapInstanceRef.current.getView();
                          view.animate({
                            center: fromLonLat([report.longitude, report.latitude]),
                            zoom: 12,
                            duration: 1000
                          });
                        }
                      }}
                    >
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Space>
                        <Text strong>{report.nickname || report.username}</Text>
                        {report.nickname && <Text type="secondary">({report.username})</Text>}
                      </Space>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {report.latitude.toFixed(6)}, {report.longitude.toFixed(6)}
                      </Text>
                      {report.address && (
                        <Text style={{ fontSize: '11px' }} ellipsis>
                          {report.address}
                        </Text>
                      )}
                      {/* 天气和精度信息显示 - 放在一行 */}
                      <Space size={0} style={{ fontSize: '11px', flexWrap: 'wrap', gap: '1px' }}>
                        {/* 天气信息 */}
                        {report.weather_info && (
                          <>
                            <Tag color="blue">
                              🌤️ {report.weather_info.天气 || '未知'}
                            </Tag>
                            <Tag color="orange">
                              🌡️ {report.weather_info["温度(℃)"] || '未知'}°C
                            </Tag>
                            {report.weather_info["湿度(%)"] && (
                              <Tag color="green">
                                💧 {report.weather_info["湿度(%)"]}%
                              </Tag>
                            )}
                          </>
                        )}
                        {/* 来源和精度信息 */}
                        <Tag color={getSourceTagColor(report.source)}>
                          📍 {report.source || '未知'}
                        </Tag>
                        {getAccuracyTag(report.accuracy)}
                        {/* 通知按钮 */}
                        <Button
                          type="default"
                          size="small"
                          icon={<BellOutlined />}
                          loading={sendingNotifications.has(report.id)}
                          onClick={(e: React.MouseEvent<HTMLElement>) => {
                            e.stopPropagation(); // 阻止触发Card的点击事件
                            sendNotification(report);
                          }}
                          style={{ 
                            padding: '1px 6px', 
                            height: '22px', 
                            fontSize: '11px',
                            backgroundColor: '#f0f8ff',
                            borderColor: '#1890ff',
                            color: '#1890ff',
                            minWidth: 'auto',
                            lineHeight: '20px',
                            borderRadius: '4px'
                          }}
                          title={`向 ${report.nickname || report.username} 发送位置通知`}
                        >
                          通知
                        </Button>
                      </Space>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        <span>📍 位置: {dayjs(report.create_time).format('MM-DD HH:mm')}</span>
                        {report.weather_time && (
                          <span style={{ marginLeft: '8px', color: '#1890ff' }}>
                            🌤️ 天气: {dayjs(report.weather_time).format('MM-DD HH:mm')}
                          </span>
                        )}
                      </Text>
                    </Space>
                  </Card>
                  );
                })}
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SafeAlertAgent;
