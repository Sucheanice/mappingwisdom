import { Box, Button, Card, Flex, Heading, HStack, IconButton, Input, Stack, Text, VStack, Spinner } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { FiZoomIn, FiZoomOut, FiRefreshCw, FiSearch, FiNavigation, FiTrash2, FiSquare, FiCircle, FiMapPin } from "react-icons/fi"

import { OpenAPI } from "@/client"
import { MapClient } from "@/client/map"
import { MapWebSocketClient, type MapEventMessage } from "@/client/ws"
import "ol/ol.css"

export const Route = createFileRoute("/_layout/smartMapThree")({
  component: SmartMapPageThree,
})

type MapMarker = {
  id: string
  name: string
  coordinate: [number, number]
  description?: string
}

function SmartMapPageThree() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<any>(null)
  const vectorSourceRef = useRef<any>(null)
  const drawingsSourceRef = useRef<any>(null)
  const measurementsSourceRef = useRef<any>(null)
  const drawInteractionRef = useRef<any>(null)

  const [searchValue, setSearchValue] = useState("")
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [currentLayer, setCurrentLayer] = useState("osm")
  const [drawMode, setDrawMode] = useState<string | null>(null)
  // const [clearMode, setClearMode] = useState<string | null>(null) // 未使用，已注释
  const [measurements, setMeasurements] = useState<Array<{ id: string; type: string; value: string }>>([])
  const [mapInitialized, setMapInitialized] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // 使用 OpenAPI.BASE，它已经在登录时被正确设置
  let apiBase = OpenAPI.BASE
  console.log("🔧 smartMapThree - 使用 OpenAPI.BASE:", apiBase)

  // 如果 OpenAPI.BASE 为空或不正确，尝试修复
  if (!apiBase || apiBase.includes('localhost:8009') || apiBase.includes('localhost:8000')) {
    apiBase = import.meta.env.VITE_API_URL || window.location.origin
    // 修复端口：如果使用了错误的端口（8000），替换为正确的端口（8009）
    if (apiBase.includes(':8000')) {
      apiBase = apiBase.replace(':8000', ':8009')
    }
    // 如果当前页面在 5173 端口且 API base 没有指定端口，使用 8009
    if (window.location.origin.includes(':5173') && !apiBase.includes(':8009') && !apiBase.includes(':8000')) {
      apiBase = window.location.origin.replace(':5173', ':8009')
    }
    console.log("🔧 smartMapThree - 修复后的 apiBase:", apiBase)
  }

  console.log("🔧 smartMapThree - 最终 apiBase:", apiBase)
  const mapApi = new MapClient(apiBase)
  const wsClient = new MapWebSocketClient(apiBase)

  // 初始化地图
  useEffect(() => {
    let disposed = false
    const init = async () => {
      const [
        { default: Map },
        { default: View },
        { default: TileLayer },
        { default: XYZ },
        { default: VectorLayer },
        { default: VectorSource },
        { default: Feature },
        geom,
        style,
        proj,
        { defaults: defaultControls, FullScreen, ScaleLine },
      ] = await Promise.all([
        import("ol/Map.js"),
        import("ol/View.js"),
        import("ol/layer/Tile.js"),
        import("ol/source/XYZ.js"),
        import("ol/layer/Vector.js"),
        import("ol/source/Vector.js"),
        import("ol/Feature.js"),
        import("ol/geom.js"),
        import("ol/style.js"),
        import("ol/proj.js"),
        import("ol/control.js"),
      ])

      if (disposed) return

      // 高德地图API Key - 从环境变量读取，如果没有则使用默认值（仅用于开发）
      // ⚠️ 警告：生产环境必须通过环境变量 VITE_AMAP_API_KEY 配置
      // const AMAP_KEY = import.meta.env.VITE_AMAP_API_KEY || "cbfcad74ad3ddfb72ba7770a8169cf36" // 未使用
      
      // 底图图层 - 使用高德地图瓦片服务
      // 高德地图标准地图
      const osmLayer = new TileLayer({ 
        source: new XYZ({
          url: `https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`,
          crossOrigin: "anonymous",
          attributions: '© 高德地图',
        }),
        visible: true 
      })
      
      // 高德地图卫星图（如果需要）
      const satelliteLayer = new TileLayer({
        source: new XYZ({
          url: `https://webst0{1-4}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}`,
          crossOrigin: "anonymous",
          attributions: '© 高德地图',
        }),
        visible: false,
      })
      
      // 高德地图路网图层（作为地形图层替代）
      const terrainLayer = new TileLayer({
        source: new XYZ({
          url: `https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}`,
          crossOrigin: "anonymous",
          attributions: '© 高德地图',
        }),
        visible: false,
      })

      // 功能图层
      const vectorSource = new VectorSource()
      vectorSourceRef.current = vectorSource
      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: new style.Style({
          image: new style.Circle({
            radius: 8,
            fill: new style.Fill({ color: "#ff0000" }),
            stroke: new style.Stroke({ color: "#ffffff", width: 2 }),
          }),
          text: new style.Text({ text: "📍", scale: 1.5, offsetY: -20 }),
        }),
      })

      const drawingsSource = new VectorSource()
      drawingsSourceRef.current = drawingsSource
      const drawingsLayer = new VectorLayer({
        source: drawingsSource,
        style: (feature: any) => {
          const geomType = feature.getGeometry().getType()
          // 为点添加样式
          if (geomType === "Point") {
            return new style.Style({
              image: new style.Circle({
                radius: 8,
                fill: new style.Fill({ color: "#ff0000" }),
                stroke: new style.Stroke({ color: "#ffffff", width: 2 }),
              }),
            })
          }
          // 为线和多边形添加样式
          return new style.Style({
            fill: new style.Fill({ color: "rgba(255, 255, 0, 0.2)" }),
            stroke: new style.Stroke({ color: "#ff0000", width: 2 }),
          })
        },
      })

      const measurementsSource = new VectorSource()
      measurementsSourceRef.current = measurementsSource
      const measurementsLayer = new VectorLayer({
        source: measurementsSource,
        style: new style.Style({
          fill: new style.Fill({ color: "rgba(0, 255, 0, 0.2)" }),
          stroke: new style.Stroke({ color: "#00ff00", width: 2 }),
        }),
      })

      // 创建自定义控件集合，排除默认的缩放控件
      const controls = defaultControls({
        zoom: false, // 移除默认的缩放控件
      }).extend([new FullScreen(), new ScaleLine()])

      const map = new Map({
        target: mapRef.current!,
        layers: [osmLayer, satelliteLayer, terrainLayer, vectorLayer, drawingsLayer, measurementsLayer],
        view: new View({ center: proj.fromLonLat([116.3974, 39.9093]), zoom: 10 }),
        controls: controls,
      })
      
      // 添加右键点击事件处理：取消绘制模式
      const handleContextMenu = (event: MouseEvent) => {
        event.preventDefault()
        // 如果正在绘制模式，取消绘制
        if (drawInteractionRef.current && mapInstance.current) {
          mapInstance.current.removeInteraction(drawInteractionRef.current)
          drawInteractionRef.current = null
          setDrawMode(null)
        }
      }
      const viewport = map.getViewport()
      viewport.addEventListener("contextmenu", handleContextMenu)
      
      mapInstance.current = map
      setMapInitialized(true)
      setMapError(null)

      // 从 localStorage 加载保存的测量结果
      const savedMeasurements = loadMeasurements()
      if (savedMeasurements.length > 0) {
        setMeasurements(savedMeasurements)
      }

      // WebSocket 监听（非阻塞，连接失败不影响地图显示）
      let off: (() => void) | null = null
      try {
        off = wsClient.onMessage((msg) => handleMapEvent(msg, { proj, Feature, geom, style }))
        wsClient.connect()
      } catch (error) {
        console.warn("WebSocket连接失败，地图将继续正常工作（无实时同步）:", error)
        setMapError("WebSocket连接失败，实时同步功能不可用")
      }

      // 注意：右键菜单已在 handleContextMenu 中处理，这里不需要再次禁用

      // 从后端加载初始状态（非阻塞，加载失败不影响地图显示）
      try {
        const res = await mapApi.getState()
        if (res?.state && mapInstance.current) {
          // 应用初始图层
          if (res.state.current_layer) {
            const layerType = res.state.current_layer
            const mapLayers = mapInstance.current.getLayers().getArray()
            mapLayers[0].setVisible(layerType === "osm")
            mapLayers[1].setVisible(layerType === "satellite")
            mapLayers[2].setVisible(layerType === "terrain")
            setCurrentLayer(layerType)
          }
          
          // 先清除前端状态，再加载后端状态（避免重复）
          vectorSource.clear()
          drawingsSourceRef.current?.clear()
          measurementsSourceRef.current?.clear()
          setMarkers([])
          setMeasurements([])
          
          // 加载标记点
          if (res.state.markers?.length) {
            const loadedMarkers: MapMarker[] = []
            for (const m of res.state.markers as MapMarker[]) {
              const f = new Feature({ geometry: new geom.Point(proj.fromLonLat(m.coordinate)) })
              f.setStyle(
                new style.Style({
                  image: new style.Circle({
                    radius: 8,
                    fill: new style.Fill({ color: "#ff0000" }),
                    stroke: new style.Stroke({ color: "#ffffff", width: 2 }),
                  }),
                  text: new style.Text({ text: "📍", scale: 1.5, offsetY: -20 }),
                })
              )
              f.set("markerId", m.id)
              f.set("markerName", m.name)
              vectorSource.addFeature(f)
              loadedMarkers.push(m)
            }
            setMarkers(loadedMarkers)
          }
          
          // 加载绘制图形
          if (res.state.drawings?.length && drawingsSourceRef.current) {
            for (const d of res.state.drawings as any[]) {
              try {
                const { id, type, coordinates } = d
                if (!id || !type || !coordinates || !Array.isArray(coordinates)) {
                  console.warn("绘制图形数据不完整:", d)
                  continue
                }
                
                // 将坐标转换为 OpenLayers 坐标系
                const coords: number[][] = []
                for (const coord of coordinates) {
                  if (Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                    coords.push(proj.fromLonLat([coord[0], coord[1]]))
                  }
                }
                
                if (coords.length === 0) {
                  console.warn("无效的坐标数据:", coordinates)
                  continue
                }
                
                let geometry: any = null
                
                // 根据类型创建几何图形
                if (type === "point") {
                  if (coords.length >= 1) {
                    geometry = new geom.Point(coords[0])
                  }
                } else if (type === "line") {
                  if (coords.length >= 2) {
                    geometry = new geom.LineString(coords)
                  }
                } else if (type === "polygon") {
                  if (coords.length >= 3) {
                    // 确保多边形闭合（首尾相同）
                    const first = coords[0]
                    const last = coords[coords.length - 1]
                    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
                      coords.push([...first])
                    }
                    geometry = new geom.Polygon([coords])
                  }
                } else if (type === "circle") {
                  if (coords.length >= 2) {
                    // circle 类型：第一个点是圆心，第二个点是圆周上的点
                    const center = coords[0]
                    const radiusPoint = coords[1]
                    if (center && radiusPoint) {
                      const radius = Math.sqrt(
                        Math.pow(center[0] - radiusPoint[0], 2) + 
                        Math.pow(center[1] - radiusPoint[1], 2)
                      )
                      geometry = new geom.Circle(center, radius)
                    }
                  }
                }
                
                if (geometry) {
                  const feature = new Feature({ geometry })
                  feature.set("drawingId", id)
                  feature.set("drawingType", type)
                  
                  // 应用样式
                  const geomType = geometry.getType()
                  if (geomType === "Point") {
                    feature.setStyle(
                      new style.Style({
                        image: new style.Circle({
                          radius: 8,
                          fill: new style.Fill({ color: "#ff0000" }),
                          stroke: new style.Stroke({ color: "#ffffff", width: 2 }),
                        }),
                      })
                    )
                  } else {
                    feature.setStyle(
                      new style.Style({
                        fill: new style.Fill({ color: "rgba(255, 255, 0, 0.2)" }),
                        stroke: new style.Stroke({ color: "#ff0000", width: 2 }),
                      })
                    )
                  }
                  
                  drawingsSourceRef.current.addFeature(feature)
                  console.log("已加载绘制图形:", id, type)
                }
              } catch (error) {
                console.error("加载绘制图形失败:", error, d)
              }
            }
          }
          
          // 加载测量结果
          if (res.state.measurements?.length && measurementsSourceRef.current) {
            const loadedMeasurements: Array<{ id: string; type: string; value: string }> = []
            for (const m of res.state.measurements as any[]) {
              try {
                const { id, type, value, coordinates } = m
                if (!id || !type || !value) {
                  console.warn("测量结果数据不完整:", m)
                  continue
                }
                
                loadedMeasurements.push({ id, type, value })
                
                // 如果有坐标，在地图上显示
                if (coordinates && Array.isArray(coordinates) && coordinates.length > 0) {
                  if (type === "length" && coordinates.length >= 2) {
                    // 距离测量：显示一条线
                    const coords: number[][] = []
                    for (const coord of coordinates) {
                      if (Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                        coords.push(proj.fromLonLat([coord[0], coord[1]]))
                      }
                    }
                    
                    if (coords.length >= 2) {
                      const geometry = new geom.LineString(coords)
                      const feature = new Feature({ geometry })
                      feature.set("measurementId", id)
                      feature.set("measurementType", type)
                      feature.setStyle(
                        new style.Style({
                          stroke: new style.Stroke({ color: "#00ff00", width: 2 }),
                        })
                      )
                      measurementsSourceRef.current.addFeature(feature)
                    }
                  } else if (type === "area" && coordinates.length >= 3) {
                    // 面积测量：显示多边形
                    const coords: number[][] = []
                    for (const coord of coordinates) {
                      if (Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                        coords.push(proj.fromLonLat([coord[0], coord[1]]))
                      }
                    }
                    
                    if (coords.length >= 3) {
                      // 确保多边形闭合
                      const first = coords[0]
                      const last = coords[coords.length - 1]
                      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
                        coords.push([...first])
                      }
                      const geometry = new geom.Polygon([coords])
                      const feature = new Feature({ geometry })
                      feature.set("measurementId", id)
                      feature.set("measurementType", type)
                      feature.setStyle(
                        new style.Style({
                          fill: new style.Fill({ color: "rgba(0, 255, 0, 0.2)" }),
                          stroke: new style.Stroke({ color: "#00ff00", width: 2 }),
                        })
                      )
                      measurementsSourceRef.current.addFeature(feature)
                    }
                  }
                }
              } catch (error) {
                console.error("加载测量结果失败:", error, m)
              }
            }
            setMeasurements(loadedMeasurements)
          }
        }
      } catch (error: any) {
        let errorMsg = "未知错误"
        if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
          errorMsg = `无法连接到后端服务 (${apiBase}/api/v1/map/state)。请确保：\n1. 后端服务正在运行（地址: ${OpenAPI.BASE || '未配置'}）\n2. 检查浏览器控制台的网络请求详情\n3. 如果是CORS错误，检查后端CORS配置`
        } else if (error?.response?.status === 404) {
          errorMsg = `地图API端点不存在 (${apiBase}/api/v1/map/state)，请检查后端路由配置`
        } else if (error?.response?.status) {
          errorMsg = `后端返回错误 ${error.response.status}: ${error.response.statusText}`
        } else {
          errorMsg = error?.message || "未知错误"
        }
        console.error("加载初始地图状态失败:", error)
        console.error("API Base URL:", apiBase)
        console.error("尝试访问的URL:", `${apiBase}/api/v1/map/state`)
        setMapError(`⚠️ 后端连接失败: ${errorMsg}\n\n地图仍可正常使用，但以下功能不可用：\n- 实时同步\n- 保存标记点状态`)
      }

      return () => {
        if (off) off()
      }
    }
    const cleanupPromise = init()
    return () => {
      void cleanupPromise
      disposed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMapEvent = (msg: MapEventMessage, deps: any) => {
    if (msg.type === "addMarker" && vectorSourceRef.current) {
      const { lon, lat, name, id } = msg.payload as any
      if (typeof lon === "number" && typeof lat === "number") {
        // 检查标记点是否已存在，避免重复添加
        const existingFeatures = vectorSourceRef.current.getFeatures()
        const markerId = id || `marker_${Date.now()}`
        const alreadyExists = existingFeatures.some((f: any) => f.get("markerId") === markerId)
        
        if (!alreadyExists) {
          const coords = deps.proj.fromLonLat([lon, lat])
          const f = new deps.Feature({ geometry: new deps.geom.Point(coords) })
          f.setStyle(
            new deps.style.Style({
              image: new deps.style.Circle({
                radius: 8,
                fill: new deps.style.Fill({ color: "#ff0000" }),
                stroke: new deps.style.Stroke({ color: "#ffffff", width: 2 }),
              }),
              text: new deps.style.Text({ text: "📍", scale: 1.5, offsetY: -20 }),
            })
          )
          f.set("markerId", markerId)
          f.set("markerName", name || "标记点")
          vectorSourceRef.current.addFeature(f)
          
          if (name) {
            setMarkers((prev) => {
              // 检查是否已存在，避免重复
              if (prev.some(m => m.id === markerId)) {
                return prev
              }
              return [...prev, { id: markerId, name, coordinate: [lon, lat] }]
            })
          }
        }
      }
    } else if (msg.type === "setCenter" && mapInstance.current) {
      // 处理地图中心移动事件（用于 search_and_locate）
      const { lon, lat, zoom } = msg.payload as any
      if (typeof lon === "number" && typeof lat === "number") {
        const coords = deps.proj.fromLonLat([lon, lat])
        const view = mapInstance.current.getView()
        view.animate({
          center: coords,
          zoom: typeof zoom === "number" ? zoom : view.getZoom(),
          duration: 1000
        })
      }
    } else if (msg.type === "switchLayer" && mapInstance.current) {
      // 处理图层切换事件
      const { layer_type } = msg.payload as any
      if (layer_type && ["osm", "satellite", "terrain"].includes(layer_type)) {
        const layers = mapInstance.current.getLayers().getArray()
        layers[0].setVisible(layer_type === "osm")
        layers[1].setVisible(layer_type === "satellite")
        layers[2].setVisible(layer_type === "terrain")
        setCurrentLayer(layer_type)
      }
    } else if (msg.type === "clearAll") {
      // 处理清除所有内容事件
      vectorSourceRef.current?.clear()
      drawingsSourceRef.current?.clear()
      measurementsSourceRef.current?.clear()
      setMarkers([])
      setMeasurements([])
      // 清除保存的测量结果
      try {
        localStorage.removeItem("smartMap3_measurements")
      } catch (error) {
        console.warn("清除测量结果失败:", error)
      }
    } else if (msg.type === "clearMarkers") {
      // 处理清除标记点事件
      vectorSourceRef.current?.clear()
      setMarkers([])
    } else if (msg.type === "clearDrawings") {
      // 处理清除绘制图形事件
      drawingsSourceRef.current?.clear()
    } else if (msg.type === "clearMeasurements") {
      // 处理清除测量结果事件
      measurementsSourceRef.current?.clear()
      setMeasurements([])
      try {
        localStorage.removeItem("smartMap3_measurements")
      } catch (error) {
        console.warn("清除测量结果失败:", error)
      }
    } else if (msg.type === "addDrawing" && drawingsSourceRef.current) {
      // 处理添加绘制图形事件（来自 WebSocket）
      const { id, type, coordinates } = msg.payload as any
      if (!id || !type || !coordinates || !Array.isArray(coordinates)) {
        console.warn("addDrawing 事件数据不完整:", msg.payload)
        return
      }
      
      try {
        // 检查是否已存在，避免重复添加
        const existingFeatures = drawingsSourceRef.current.getFeatures()
        const alreadyExists = existingFeatures.some((f: any) => f.get("drawingId") === id)
        if (alreadyExists) {
          console.log("绘制图形已存在，跳过:", id)
          return
        }
        
        // 将坐标转换为 OpenLayers 坐标系
        const coords = coordinates.map((coord: number[]) => {
          if (Array.isArray(coord) && coord.length >= 2) {
            return deps.proj.fromLonLat([coord[0], coord[1]])
          }
          return null
        }).filter((c: any) => c !== null)
        
        if (coords.length === 0) {
          console.warn("无效的坐标数据:", coordinates)
          return
        }
        
        let geometry: any = null
        
        // 根据类型创建几何图形
        if (type === "point") {
          if (coords.length >= 1) {
            geometry = new deps.geom.Point(coords[0])
          }
        } else if (type === "line") {
          if (coords.length >= 2) {
            geometry = new deps.geom.LineString(coords)
          }
        } else if (type === "polygon") {
          if (coords.length >= 3) {
            // 确保多边形闭合（首尾相同）
            if (coords[0][0] !== coords[coords.length - 1][0] || 
                coords[0][1] !== coords[coords.length - 1][1]) {
              coords.push(coords[0])
            }
            geometry = new deps.geom.Polygon([coords])
          }
        } else if (type === "circle") {
          if (coords.length >= 2) {
            // circle 类型：第一个点是圆心，第二个点是圆周上的点
            const center = coords[0]
            const radiusPoint = coords[1]
            const radius = Math.sqrt(
              Math.pow(center[0] - radiusPoint[0], 2) + 
              Math.pow(center[1] - radiusPoint[1], 2)
            )
            geometry = new deps.geom.Circle(center, radius)
          }
        }
        
        if (geometry) {
          const feature = new deps.Feature({ geometry })
          feature.set("drawingId", id)
          feature.set("drawingType", type)
          
          // 应用样式
          const geomType = geometry.getType()
          if (geomType === "Point") {
            feature.setStyle(
              new deps.style.Style({
                image: new deps.style.Circle({
                  radius: 8,
                  fill: new deps.style.Fill({ color: "#ff0000" }),
                  stroke: new deps.style.Stroke({ color: "#ffffff", width: 2 }),
                }),
              })
            )
          } else {
            feature.setStyle(
              new deps.style.Style({
                fill: new deps.style.Fill({ color: "rgba(255, 255, 0, 0.2)" }),
                stroke: new deps.style.Stroke({ color: "#ff0000", width: 2 }),
              })
            )
          }
          
          drawingsSourceRef.current.addFeature(feature)
          console.log("已添加绘制图形:", id, type)
        } else {
          console.warn("无法创建几何图形，类型:", type, "坐标数量:", coords.length)
        }
      } catch (error) {
        console.error("处理 addDrawing 事件失败:", error, msg.payload)
      }
    } else if (msg.type === "removeDrawing" && drawingsSourceRef.current) {
      // 处理删除绘制图形事件
      const { id } = msg.payload as any
      if (id) {
        const features = drawingsSourceRef.current.getFeatures()
        const feature = features.find((f: any) => f.get("drawingId") === id)
        if (feature) {
          drawingsSourceRef.current.removeFeature(feature)
          console.log("已删除绘制图形:", id)
        }
      }
    }
  }

  // 地图控制
  const zoomIn = async () => {
    if (!mapInstance.current) return
    const view = mapInstance.current.getView()
    view.animate({ zoom: view.getZoom() + 1, duration: 300 })
  }

  const zoomOut = async () => {
    if (!mapInstance.current) return
    const view = mapInstance.current.getView()
    view.animate({ zoom: view.getZoom() - 1, duration: 300 })
  }

  const resetView = async () => {
    if (!mapInstance.current) return
    const { fromLonLat } = await import("ol/proj.js")
    const view = mapInstance.current.getView()
    view.animate({ center: fromLonLat([116.3974, 39.9093]), zoom: 10, duration: 1000 })
  }

  const getCurrentLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { longitude, latitude } = pos.coords
      const { fromLonLat } = await import("ol/proj.js")
      if (mapInstance.current) {
        const view = mapInstance.current.getView()
        view.animate({ center: fromLonLat([longitude, latitude]), zoom: 15, duration: 1000 })
      }
      await mapApi.addMarker({ id: `loc_${Date.now()}`, name: "我的位置", coordinate: [longitude, latitude], description: "GPS定位" })
    })
  }

  const searchLocation = async () => {
    if (!searchValue.trim()) return
    try {
      const res = await mapApi.locate({ query: searchValue, zoom: 15, add_marker: true })
      if (res.success && mapInstance.current && res.map_instructions) {
        const { fromLonLat } = await import("ol/proj.js")
        const view = mapInstance.current.getView()
        // 确保坐标格式正确：[经度, 纬度]
        const center = res.map_instructions.center
        if (Array.isArray(center) && center.length === 2) {
          view.animate({ 
            center: fromLonLat(center), 
            zoom: res.map_instructions.zoom || 15, 
            duration: 1000 
          })
          // 如果返回了标记点，添加到地图
          if (res.marker) {
            setMarkers((prev) => {
              // 检查是否已存在相同 ID 的标记点，避免重复
              const exists = prev.some(m => m.id === res.marker.id)
              if (exists) return prev
              return [...prev, res.marker]
            })
          }
        } else {
          console.error("无效的坐标格式:", center)
          setMapError("返回的坐标格式无效")
        }
      } else {
        setMapError("搜索失败，请重试")
      }
    } catch (error: any) {
      console.error("搜索位置失败:", error)
      const errorMessage = error?.response?.data?.detail || error?.message || "搜索失败，请检查网络连接或尝试其他关键词"
      setMapError(errorMessage)
      // 3秒后清除错误提示
      setTimeout(() => setMapError(null), 3000)
    }
  }

  // 图层切换
  const switchLayer = async (layerType: string) => {
    if (!mapInstance.current) return
    
    // 前端立即切换图层（提供即时反馈）
    const layers = mapInstance.current.getLayers().getArray()
    layers[0].setVisible(layerType === "osm")
    layers[1].setVisible(layerType === "satellite")
    layers[2].setVisible(layerType === "terrain")
    setCurrentLayer(layerType)
    
    // 调用后端 API 同步状态（非阻塞，失败不影响前端显示）
    try {
      await mapApi.switchLayer(layerType as "osm" | "satellite" | "terrain")
    } catch (error) {
      console.warn("图层切换同步失败:", error)
    }
  }

  // 绘制工具
  const startDrawing = async (drawType: string) => {
    if (!mapInstance.current) return
    const { default: Draw } = await import("ol/interaction/Draw.js")
    const interactions = mapInstance.current.getInteractions()
    interactions.forEach((i: any) => {
      if (i instanceof Draw) mapInstance.current.removeInteraction(i)
    })

    let type: any
    if (drawType === "point") type = "Point"
    else if (drawType === "line") type = "LineString"
    else if (drawType === "polygon") type = "Polygon"
    else if (drawType === "circle") type = "Circle"
    else return

    const draw = new Draw({ 
      source: drawingsSourceRef.current, 
      type,
      // 对于点和圆，绘制完成后自动停止
      stopClick: drawType === "point" || drawType === "circle",
    })
    
    // 对于点类型，绘制完成后自动退出绘制模式，并添加到标记点列表
    if (drawType === "point") {
      draw.on("drawend", async (event: any) => {
        const geom = event.feature.getGeometry()
        const { toLonLat } = await import("ol/proj.js")
        const { default: Feature } = await import("ol/Feature.js")
        const { Point } = await import("ol/geom.js")
        const styleModule = await import("ol/style.js")
        
        // 获取点的坐标并转换为经纬度
        const coords = geom.getCoordinates()
        const [lon, lat] = toLonLat(coords)
        
        // 添加到标记点列表（使用函数式更新以确保计数准确）
        const pointId = `point_${Date.now()}`
        setMarkers((prev) => {
          const pointName = `绘制点 ${prev.length + 1}`
          const newMarker: MapMarker = {
            id: pointId,
            name: pointName,
            coordinate: [lon, lat],
            description: `坐标: ${lon.toFixed(6)}, ${lat.toFixed(6)}`
          }
          
          // 同时添加到标记点图层（vectorSource），以便在地图上显示为标记点
          if (vectorSourceRef.current) {
            const markerFeature = new Feature({ geometry: new Point(coords) })
            markerFeature.setStyle(
              new styleModule.Style({
                image: new styleModule.Circle({
                  radius: 8,
                  fill: new styleModule.Fill({ color: "#ff0000" }),
                  stroke: new styleModule.Stroke({ color: "#ffffff", width: 2 }),
                }),
                text: new styleModule.Text({ text: "📍", scale: 1.5, offsetY: -20 }),
              })
            )
            markerFeature.set("markerId", pointId)
            markerFeature.set("markerName", pointName)
            vectorSourceRef.current.addFeature(markerFeature)
          }
          
          // 保存到后端数据库（非阻塞，失败不影响前端显示）
          mapApi.addMarker(newMarker).catch((error) => {
            console.warn("标记点保存到数据库失败:", error)
          })
          
          return [...prev, newMarker]
        })
        
        stopDrawing()
      })
    }
    
    // 对于线类型，绘制完成后将线上的所有点添加到标记点列表
    if (drawType === "line") {
      draw.on("drawend", async (event: any) => {
        const geom = event.feature.getGeometry()
        const { toLonLat } = await import("ol/proj.js")
        const { default: Feature } = await import("ol/Feature.js")
        const { Point } = await import("ol/geom.js")
        const styleModule = await import("ol/style.js")
        
        // 获取线上的所有点坐标
        const coordinates = geom.getCoordinates()
        
        // 将每个点添加到标记点列表
        setMarkers((prev) => {
          const newMarkers: MapMarker[] = []
          const newFeatures: any[] = []
          
          coordinates.forEach((coord: number[], index: number) => {
            const [lon, lat] = toLonLat(coord)
            const pointId = `line_point_${Date.now()}_${index}`
            const baseIndex = prev.length + 1
            const pointName = `线点 ${baseIndex + index}`
            
            const newMarker: MapMarker = {
              id: pointId,
              name: pointName,
              coordinate: [lon, lat],
              description: `来自绘制线，第 ${index + 1} 个点`
            }
            newMarkers.push(newMarker)
            
            // 同时添加到标记点图层（vectorSource），以便在地图上显示为标记点
            if (vectorSourceRef.current) {
              const markerFeature = new Feature({ geometry: new Point(coord) })
              markerFeature.setStyle(
                new styleModule.Style({
                  image: new styleModule.Circle({
                    radius: 6,
                    fill: new styleModule.Fill({ color: "#00ff00" }),
                    stroke: new styleModule.Stroke({ color: "#ffffff", width: 2 }),
                  }),
                  text: new styleModule.Text({ text: `${index + 1}`, scale: 1.2, offsetY: -18, fill: new styleModule.Fill({ color: "#000000" }) }),
                })
              )
              markerFeature.set("markerId", pointId)
              markerFeature.set("markerName", pointName)
              newFeatures.push(markerFeature)
            }
          })
          
          // 批量添加标记点到图层
          if (vectorSourceRef.current && newFeatures.length > 0) {
            newFeatures.forEach(feature => {
              vectorSourceRef.current.addFeature(feature)
            })
          }
          
          return [...prev, ...newMarkers]
        })
        
        // 保存绘制线到数据库（非阻塞）
        try {
          const lineCoords = coordinates.map((coord: number[]) => toLonLat(coord))
          await mapApi.addDrawing({
            id: `line_${Date.now()}`,
            type: "line",
            coordinates: lineCoords
          })
        } catch (error) {
          console.warn("绘制线保存到数据库失败:", error)
        }
        
        stopDrawing()
      })
    }
    
    // 对于多边形和圆形类型，绘制完成后保存到数据库
    if (drawType === "polygon" || drawType === "circle") {
      draw.on("drawend", async (event: any) => {
        const geom = event.feature.getGeometry()
        const { toLonLat } = await import("ol/proj.js")
        
        let coords4326: any[] = []
        if (drawType === "polygon") {
          const coordinates = geom.getCoordinates()
          // Polygon 的坐标是环数组，第一个环是外环
          coords4326 = coordinates[0].map((coord: number[]) => toLonLat(coord))
        } else if (drawType === "circle") {
          // Circle 需要获取中心和半径，然后转换为多边形坐标
          const center = geom.getCenter()
          const radius = geom.getRadius()
          const [centerLon, centerLat] = toLonLat(center)
          
          // 生成圆形边界点（近似为多边形）
          const numPoints = 64
          coords4326 = []
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI
            const lon = centerLon + (radius / 111320) * Math.cos(angle) / Math.cos(centerLat * Math.PI / 180)
            const lat = centerLat + (radius / 111320) * Math.sin(angle)
            coords4326.push([lon, lat])
          }
        }
        
        // 保存绘制图形到数据库（非阻塞）
        try {
          await mapApi.addDrawing({
            id: `${drawType}_${Date.now()}`,
            type: drawType,
            coordinates: coords4326
          })
        } catch (error) {
          console.warn(`绘制${drawType === "polygon" ? "多边形" : "圆形"}保存到数据库失败:`, error)
        }
        
        stopDrawing()
      })
    }
    
    mapInstance.current.addInteraction(draw)
    drawInteractionRef.current = draw
    setDrawMode(drawType)
  }

  const stopDrawing = () => {
    if (!mapInstance.current || !drawInteractionRef.current) return
    mapInstance.current.removeInteraction(drawInteractionRef.current)
    drawInteractionRef.current = null
    setDrawMode(null)
  }

  // 保存测量结果到 localStorage
  const saveMeasurements = (measurementsList: Array<{ id: string; type: string; value: string }>) => {
    try {
      localStorage.setItem("smartMap3_measurements", JSON.stringify(measurementsList))
    } catch (error) {
      console.warn("保存测量结果失败:", error)
    }
  }

  // 从 localStorage 加载测量结果
  const loadMeasurements = (): Array<{ id: string; type: string; value: string }> => {
    try {
      const saved = localStorage.getItem("smartMap3_measurements")
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (error) {
      console.warn("加载测量结果失败:", error)
    }
    return []
  }

  // 测量工具
  const startMeasuring = async (measureType: string) => {
    if (!mapInstance.current) return
    const { default: Draw } = await import("ol/interaction/Draw.js")
    const { getLength, getArea } = await import("ol/sphere.js")
    const { toLonLat } = await import("ol/proj.js")
    const { LineString: LineStringGeom, Polygon: PolygonGeom } = await import("ol/geom.js")
    
    const interactions = mapInstance.current.getInteractions()
    interactions.forEach((i: any) => {
      if (i instanceof Draw) mapInstance.current.removeInteraction(i)
    })

    const type = measureType === "length" ? "LineString" : "Polygon"
    const draw = new Draw({ source: measurementsSourceRef.current, type })
    mapInstance.current.addInteraction(draw)
    drawInteractionRef.current = draw

    draw.on("drawend", async (event: any) => {
      const geom = event.feature.getGeometry()
      const coordinates = geom.getCoordinates()
      let value = ""
      let coords4326: any[] = []
      
      if (measureType === "length" && geom.getType() === "LineString") {
        // 将 LineString 的每个点转换为经纬度（EPSG:4326）
        coords4326 = coordinates.map((coord: number[]) => toLonLat(coord))
        // 创建新的几何体（使用经纬度坐标）以进行准确的球面计算
        const geom4326 = new LineStringGeom(coords4326)
        const len = getLength(geom4326) // 返回米
        if (len > 1000) {
          value = `${(len / 1000).toFixed(2)} km`
        } else if (len > 1) {
          value = `${len.toFixed(2)} m`
        } else {
          value = `${(len * 100).toFixed(2)} cm`
        }
      } else if (measureType === "area" && geom.getType() === "Polygon") {
        // 将 Polygon 的每个点转换为经纬度（EPSG:4326）
        coords4326 = coordinates.map((ring: number[][]) => ring.map((coord: number[]) => toLonLat(coord)))
        // 创建新的几何体（使用经纬度坐标）以进行准确的球面计算
        const geom4326 = new PolygonGeom(coords4326)
        const area = getArea(geom4326) // 返回平方米
        if (area > 1000000) {
          // 大于1平方公里，显示平方公里
          value = `${(area / 1000000).toFixed(4)} km²`
        } else if (area > 10000) {
          // 大于1公顷，显示公顷和平方米
          value = `${(area / 10000).toFixed(4)} ha (${area.toFixed(2)} m²)`
        } else if (area > 1) {
          // 大于1平方米，显示平方米
          value = `${area.toFixed(2)} m²`
        } else {
          // 小于1平方米，显示平方分米或平方厘米
          if (area > 0.01) {
            value = `${(area * 100).toFixed(2)} dm²`
          } else {
            value = `${(area * 10000).toFixed(2)} cm²`
          }
        }
      }
      
      const measurementId = Date.now().toString()
      const newMeasurement = { id: measurementId, type: measureType, value }
      
      // 保存到本地状态
      setMeasurements((prev) => {
        const updated = [...prev, newMeasurement]
        saveMeasurements(updated)
        return updated
      })
      
      // 保存到后端数据库（非阻塞，失败不影响前端显示）
      try {
        await mapApi.addMeasurement({
          id: measurementId,
          type: measureType,
          value: value,
          coordinates: coords4326
        })
      } catch (error) {
        console.warn("测量结果保存到数据库失败:", error)
      }
      
      stopDrawing()
    })
  }

  // 清除模式（当前未使用，但保留以备将来使用）
  // const startClearing = (clearType: string) => {
  //   setClearMode(clearType)
  // }

  // const stopClearing = () => {
  //   setClearMode(null)
  // }

  const clearAll = async () => {
    // 前端立即清除（提供即时反馈）
    vectorSourceRef.current?.clear()
    drawingsSourceRef.current?.clear()
    measurementsSourceRef.current?.clear()
    setMarkers([])
    setMeasurements([])
    
    // 清除保存的测量结果
    try {
      localStorage.removeItem("smartMap3_measurements")
    } catch (error) {
      console.warn("清除测量结果失败:", error)
    }
    
    // 调用后端 API 清除数据库和内存状态（非阻塞，失败不影响前端显示）
    try {
      await mapApi.clearAll()
      // 清除后重新从后端获取状态，确保同步
      const res = await mapApi.getState()
      if (res?.state) {
        // 确保标记点列表为空
        if (!res.state.markers || res.state.markers.length === 0) {
          setMarkers([])
        }
        if (!res.state.measurements || res.state.measurements.length === 0) {
          setMeasurements([])
        }
      }
    } catch (error) {
      console.warn("清除数据库失败:", error)
    }
  }

  // 删除单个测量结果
  const deleteMeasurement = async (id: string) => {
    // 前端立即删除（提供即时反馈）
    setMeasurements((prev) => {
      const updated = prev.filter((m) => m.id !== id)
      saveMeasurements(updated)
      
      // 从地图上删除对应的测量图形
      if (measurementsSourceRef.current) {
        const features = measurementsSourceRef.current.getFeatures()
        const featureToRemove = features.find((f: any) => f.get("measurementId") === id)
        if (featureToRemove) {
          measurementsSourceRef.current.removeFeature(featureToRemove)
        }
      }
      
      return updated
    })
    
    // 调用后端 API 删除数据库记录（非阻塞）
    try {
      await mapApi.deleteMeasurement(id)
    } catch (error) {
      console.warn("删除测量结果失败:", error)
    }
  }

  return (
    <Flex gap={4} h="calc(100vh - 120px)" minH="600px" direction={{ base: "column", lg: "row" }}>
      {/* 左侧地图 */}
      <Box flex="1" minW={0} position="relative" minH="600px">
        {!mapInitialized && (
          <Box position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center" zIndex={100} bg="gray.50">
            <VStack gap={4}>
              <Spinner size="xl" />
              <Text>地图加载中...</Text>
            </VStack>
          </Box>
        )}
        {mapError && (
          <Box
            position="absolute"
            top={4}
            left={4}
            right={4}
            zIndex={101}
            maxW="600px"
            p={4}
            bg="orange.50"
            borderWidth="1px"
            borderColor="orange.200"
            borderRadius="md"
            shadow="lg"
          >
            <VStack align="start" gap={2}>
              <Text fontWeight="bold" color="orange.800">⚠️ 提示</Text>
              <Text fontSize="sm" color="gray.700" whiteSpace="pre-line">
                {mapError}
              </Text>
            </VStack>
          </Box>
        )}
        <Box ref={mapRef} w="100%" h="100%" minH="600px" borderRadius="md" borderWidth="1px" />
        {/* 浮动控制按钮 */}
        <VStack position="absolute" top={4} left={4} gap={2} zIndex={10}>
          <IconButton aria-label="放大" size="sm" onClick={zoomIn}><FiZoomIn /></IconButton>
          <IconButton aria-label="缩小" size="sm" onClick={zoomOut}><FiZoomOut /></IconButton>
          <IconButton aria-label="重置" size="sm" onClick={resetView}><FiRefreshCw /></IconButton>
          <IconButton aria-label="定位" size="sm" onClick={getCurrentLocation}><FiNavigation /></IconButton>
        </VStack>
      </Box>

      {/* 右侧控制面板 */}
      <VStack w={{ base: "full", lg: "320px" }} gap={3} align="stretch">
        {/* 搜索位置 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>搜索位置</Heading>
            <HStack>
              <Input value={searchValue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchValue(e.target.value)} placeholder="输入城市或地标" size="sm" />
              <IconButton aria-label="搜索" size="sm" onClick={searchLocation}><FiSearch /></IconButton>
            </HStack>
          </Card.Body>
        </Card.Root>

        {/* 图层切换 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>图层切换</Heading>
            <Stack gap={2}>
              <Button size="sm" variant={currentLayer === "osm" ? "solid" : "outline"} onClick={() => switchLayer("osm")}>标准地图</Button>
              <Button size="sm" variant={currentLayer === "satellite" ? "solid" : "outline"} onClick={() => switchLayer("satellite")}>卫星地图</Button>
              <Button size="sm" variant={currentLayer === "terrain" ? "solid" : "outline"} onClick={() => switchLayer("terrain")}>路网地图</Button>
            </Stack>
          </Card.Body>
        </Card.Root>

        {/* 绘制工具 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>绘制工具</Heading>
            <Stack gap={2}>
              <Button size="sm" colorScheme={drawMode === "point" ? "blue" : undefined} onClick={() => (drawMode === "point" ? stopDrawing() : startDrawing("point"))}>
                <FiMapPin /> {drawMode === "point" ? "停止" : "绘制点"}
              </Button>
              <Button size="sm" colorScheme={drawMode === "line" ? "blue" : undefined} onClick={() => (drawMode === "line" ? stopDrawing() : startDrawing("line"))}>
                绘制线
              </Button>
              <Button size="sm" colorScheme={drawMode === "polygon" ? "blue" : undefined} onClick={() => (drawMode === "polygon" ? stopDrawing() : startDrawing("polygon"))}>
                <FiSquare /> {drawMode === "polygon" ? "停止" : "绘制多边形"}
              </Button>
              <Button size="sm" colorScheme={drawMode === "circle" ? "blue" : undefined} onClick={() => (drawMode === "circle" ? stopDrawing() : startDrawing("circle"))}>
                <FiCircle /> {drawMode === "circle" ? "停止" : "绘制圆形"}
              </Button>
            </Stack>
          </Card.Body>
        </Card.Root>

        {/* 测量工具 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>测量工具</Heading>
            <Stack gap={2}>
              <Button size="sm" onClick={() => startMeasuring("length")}>测量距离</Button>
              <Button size="sm" onClick={() => startMeasuring("area")}>测量面积</Button>
            </Stack>
            {measurements.length > 0 && (
              <Box mt={2} p={2} borderWidth="1px" borderRadius="md" fontSize="xs">
                <VStack align="stretch" gap={1}>
                  {measurements.map((m) => (
                    <HStack key={m.id} justify="space-between" align="center">
                      <Text flex={1}>
                        <Text as="span" fontWeight="bold">
                          {m.type === "length" ? "距离" : "面积"}
                        </Text>
                        : {m.value}
                      </Text>
                      <IconButton
                        aria-label="删除"
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        onClick={() => deleteMeasurement(m.id)}
                      >
                        <FiTrash2 />
                      </IconButton>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            )}
          </Card.Body>
        </Card.Root>

        {/* 清除工具 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>清除工具</Heading>
            <Stack gap={2}>
              <Button size="sm" colorScheme="red" variant="outline" onClick={clearAll}>
                <FiTrash2 /> 清除所有
              </Button>
            </Stack>
          </Card.Body>
        </Card.Root>

        {/* 标记点列表 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>标记点 ({markers.length})</Heading>
            <Box maxH="200px" overflowY="auto" fontSize="xs">
              {markers.length === 0 ? (
                <Text py={2} color="gray.500" textAlign="center">暂无标记点</Text>
              ) : (
                <VStack align="stretch" gap={1}>
                  {markers.map((m) => (
                    <Box key={m.id} py={2} px={2} borderBottomWidth="1px" _last={{ borderBottomWidth: 0 }}>
                      <Text fontWeight="semibold" mb={1} fontSize="xs">{m.name}</Text>
                      <HStack gap={2} fontSize="2xs" color="gray.600" fontFamily="mono">
                        <Text>经度: {m.coordinate[0].toFixed(6)}</Text>
                        <Text>纬度: {m.coordinate[1].toFixed(6)}</Text>
                      </HStack>
                      {m.description && (
                        <Text color="gray.500" fontSize="2xs" mt={1}>
                          {m.description}
                        </Text>
                      )}
                    </Box>
                  ))}
                </VStack>
              )}
            </Box>
          </Card.Body>
        </Card.Root>
      </VStack>
    </Flex>
  )
}
