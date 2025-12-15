import { Badge, Box, Button, Card, Flex, Heading, HStack, IconButton, Input, Select, Stack, Text, VStack, createListCollection } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { FiZoomIn, FiZoomOut, FiRefreshCw, FiEye, FiEyeOff, FiAlertTriangle, FiBell, FiMapPin, FiCloud } from "react-icons/fi"

import { OpenAPI } from "@/client"
import "ol/ol.css"
import { Toaster, toaster } from "@/components/ui/toaster"

export const Route = createFileRoute("/_layout/safeAlertAgent")({
  component: SafeAlertAgent,
})

type LocationReport = {
  id: number
  user_id: number
  username: string
  nickname?: string
  latitude: number
  longitude: number
  province?: string
  city?: string
  district?: string
  address?: string
  accuracy?: number
  source?: string
  device?: string
  create_time: string
  weather_info?: {
    城市?: string
    天气?: string
    "温度(℃)"?: string
    风向?: string
    风力?: string
  }
}

type WeatherAlert = {
  report_id?: number
  user_id: number
  username: string
  nickname?: string
  location: string
  alert_reasons: string[]
  alert_level: string
  timestamp?: string
  longitude?: number
  latitude?: number
}

function SafeAlertAgent() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<any>(null)
  const vectorSourceRef = useRef<any>(null)

  const [locationReports, setLocationReports] = useState<LocationReport[]>([])
  const [filteredReports, setFilteredReports] = useState<LocationReport[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string>("")
  const [selectedSource, setSelectedSource] = useState<string>("")
  const [searchText, setSearchText] = useState("")
  const [showMarkers, setShowMarkers] = useState(true)
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([])
  const [wsStatus, setWsStatus] = useState("未连接")
  const [isSimulationEnabled, setIsSimulationEnabled] = useState(false)
  const [sendingNotifications, setSendingNotifications] = useState<Set<number>>(new Set())

  // 确保 apiBase 包含 /api/v1 前缀
  let apiBase = OpenAPI.BASE || `${window.location.origin}/api/v1`
  // 如果 apiBase 不包含 /api/v1，则添加
  if (apiBase && !apiBase.includes('/api/v1')) {
    apiBase = apiBase.replace(/\/+$/, '') + '/api/v1'
  }
  // 调试：输出 apiBase 的值
  console.log("safeAlertAgent - apiBase:", apiBase)
  console.log("safeAlertAgent - OpenAPI.BASE:", OpenAPI.BASE)

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

      // 高德地图标准地图图层
      const amapLayer = new TileLayer({ 
        source: new XYZ({
          url: `https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`,
          crossOrigin: "anonymous",
          attributions: '© 高德地图',
        }),
        visible: true 
      })

      const vectorSource = new VectorSource()
      vectorSourceRef.current = vectorSource
      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: new style.Style({
          image: new style.Circle({
            radius: 8,
            fill: new style.Fill({ color: "#ff4d4f" }),
            stroke: new style.Stroke({ color: "#fff", width: 2 }),
          }),
        }),
      })

      // 创建自定义控件集合，排除默认的缩放控件
      const controls = defaultControls({
        zoom: false, // 移除默认的缩放控件
      }).extend([new FullScreen(), new ScaleLine()])

      const map = new Map({
        target: mapRef.current!,
        layers: [amapLayer, vectorLayer],
        view: new View({ center: proj.fromLonLat([104.0, 30.0]), zoom: 6 }),
        controls: controls,
      })
      mapInstance.current = map

      // 点击标记
      map.on("click", (event: any) => {
        const features = map.getFeaturesAtPixel(event.pixel)
        if (features.length > 0) {
          const feature = features[0]
          // 从 feature 获取报告数据
          const report = feature.get("report")
          if (report) {
            const markerName = feature.get("markerName") || report.nickname || report.username
            toaster.create({
              title: markerName,
              description: `${report.address || "未知地址"}\n时间: ${new Date(report.create_time).toLocaleString()}`,
              type: "info",
            })
          }
        }
      })

      // WebSocket
      connectWebSocket(proj, Feature, geom, style)

      // 加载数据
      fetchLocationReports()
    }
    const cleanupPromise = init()
    return () => {
      void cleanupPromise
      disposed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connectWebSocket = (proj: any, Feature: any, geom: any, style: any) => {
    try {
      // 构建 WebSocket URL
      // 确保使用正确的 apiBase（应该包含 /api/v1）
      let baseUrl = apiBase
      
      // 如果 apiBase 不包含 /api/v1，强制添加
      if (!baseUrl.includes('/api/v1')) {
        baseUrl = baseUrl.replace(/\/+$/, '') + '/api/v1'
      }
      
      // 转换为 WebSocket URL
      let wsUrl = baseUrl.replace(/^http/, "ws")
      
      // 确保路径正确：移除末尾的斜杠，然后添加路径
      wsUrl = wsUrl.replace(/\/+$/, "") // 移除末尾的所有斜杠
      wsUrl += "/simulation/weather-alerts"
      
      console.log("尝试连接 WebSocket:", wsUrl)
      console.log("使用的 apiBase:", baseUrl)
      console.log("原始 apiBase:", apiBase)
      
      // 添加认证 token（如果有）
      const token = localStorage.getItem("access_token")
      if (token) {
        wsUrl += `?token=${token}`
      }
      
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setWsStatus("已连接")
        console.log("WebSocket 连接成功")
        // 不显示 toast，避免频繁提示
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "weather_alert") {
            handleWeatherAlert(data.data, proj, Feature, geom, style)
          } else if (data.type === "connected") {
            console.log("WebSocket 连接确认:", data.message)
          } else if (data.type === "pong") {
            console.log("WebSocket 心跳响应")
          }
        } catch (e) {
          console.error("WebSocket 消息解析错误:", e)
        }
      }

      ws.onclose = (event) => {
        console.log("WebSocket 连接关闭:", event.code, event.reason)
        setWsStatus("连接断开")
        // 如果不是正常关闭（code !== 1000），则尝试重连
        if (event.code !== 1000) {
          setTimeout(() => {
            console.log("尝试重新连接 WebSocket...")
            connectWebSocket(proj, Feature, geom, style)
          }, 5000)
        }
      }

      ws.onerror = (error) => {
        console.error("WebSocket 连接错误:", error)
        setWsStatus("连接错误")
      }
    } catch (error) {
      console.error("创建 WebSocket 连接失败:", error)
      setWsStatus("连接失败")
    }
  }

  const handleWeatherAlert = (alertData: WeatherAlert, proj: any, Feature: any, geom: any, style: any) => {
    const msg = `⚠️ ${alertData.location} 天气发生 ${alertData.alert_reasons.join("、")} 变化（影响人员：${alertData.nickname || alertData.username}）`
    
    toaster.create({
      title: "天气预警",
      description: msg,
      type: "warning",
      duration: 10000,
      action: {
        label: "查看位置",
        onClick: () => {
          focusOnLocation(alertData, proj, Feature, geom, style)
        },
      },
    })

    setWeatherAlerts((prev) => [alertData, ...prev.slice(0, 19)])

    // 自动聚焦到位置
    focusOnLocation(alertData, proj, Feature, geom, style)
  }

  // 聚焦到指定位置
  const focusOnLocation = (alertData: WeatherAlert, proj: any, Feature: any, geom: any, style: any) => {
    if (!mapInstance.current) return

    let coordinate: [number, number]
    if (alertData.longitude && alertData.latitude) {
      coordinate = [alertData.longitude, alertData.latitude]
    } else {
      // 从位置报告中查找
      const report = locationReports.find(
        r => r.user_id === alertData.user_id || r.username === alertData.username
      )
      if (report) {
        coordinate = [report.longitude, report.latitude]
      } else {
        return
      }
    }

      const view = mapInstance.current.getView()
      view.animate({
      center: proj.fromLonLat(coordinate),
        zoom: 10,
        duration: 1000,
    })

    // 添加聚焦标记
    if (vectorSourceRef.current) {
      const focusFeature = new Feature({
        geometry: new geom.Point(proj.fromLonLat(coordinate)),
        markerId: 'focus-marker',
      })
      
      focusFeature.setStyle(new style.Style({
        image: new style.Circle({
          radius: 12,
          fill: new style.Fill({ color: '#ff4d4f' }),
          stroke: new style.Stroke({ color: '#fff', width: 3 })
        }),
        text: new style.Text({
          text: '🚨',
          font: 'bold 16px Arial',
          fill: new style.Fill({ color: '#ff4d4f' }),
          stroke: new style.Stroke({ color: '#fff', width: 2 }),
          offsetY: -25,
          textAlign: 'center'
        })
      }))
      
      vectorSourceRef.current.addFeature(focusFeature)
      
      setTimeout(() => {
        if (vectorSourceRef.current) {
          const features = vectorSourceRef.current.getFeatures()
          const focusFeature = features.find((f: any) => f.get('markerId') === 'focus-marker')
          if (focusFeature) {
            vectorSourceRef.current.removeFeature(focusFeature)
          }
        }
      }, 3000)
    }
  }

  const fetchLocationReports = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append("limit", "100")
      if (selectedUser && selectedUser !== "__all__") params.append("username", selectedUser)
      // 注意：后端 API 不支持 source 参数筛选，所以在前端进行筛选

      // 使用新的 MySQL locations API
      const res = await fetch(`${apiBase}/mysql/locations?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLocationReports(data)
        
        // 调试：输出所有不同的 source 值
        const uniqueSources = [...new Set(data.map((r: LocationReport) => r.source).filter(Boolean))]
        console.log("数据库中的 source 值:", uniqueSources)
        
        // 不在这里直接设置 filteredReports，让 handleSearchWithData 来处理
        handleSearchWithData(data)
      }
    } catch (e) {
      toaster.create({ title: "获取数据失败", type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const updateMapMarkers = async (reports: LocationReport[]) => {
    if (!vectorSourceRef.current) return
    const { default: Feature } = await import("ol/Feature.js")
    const geom = await import("ol/geom.js")
    const style = await import("ol/style.js")
    const proj = await import("ol/proj.js")

    if (!showMarkers) {
      vectorSourceRef.current.clear()
      return
    }

    vectorSourceRef.current.clear()

    reports.forEach((r) => {
      const marker = {
      id: `marker-${r.id}`,
      name: r.nickname || r.username,
        coordinate: [r.longitude, r.latitude] as [number, number],
      report: r,
      }
      const f = new Feature({
        geometry: new geom.Point(proj.fromLonLat(marker.coordinate)),
      })
      f.set("markerId", marker.id)
      f.set("markerName", marker.name)
      if (marker.report) {
        f.set("report", marker.report)
      }

      let color = "#1890ff"
      let radius = 8
      if (marker.report?.weather_info?.天气) {
        const weather = marker.report.weather_info.天气
        if (weather.includes("晴")) {
          color = "#faad14"
          radius = 10
        } else if (weather.includes("雨")) {
          color = "#1890ff"
        } else if (weather.includes("雪")) {
          color = "#52c41a"
        } else if (weather.includes("云") || weather.includes("阴")) {
          color = "#722ed1"
        }
      }

      let text = marker.name
      if (marker.report?.weather_info) {
        const temp = marker.report.weather_info["温度(℃)"] || ""
        const weather = marker.report.weather_info.天气 || ""
        if (temp && weather) {
          text = `${marker.name}\n${weather} ${temp}°C`
        }
      }

      f.setStyle(
        new style.Style({
          image: new style.Circle({
            radius,
            fill: new style.Fill({ color }),
            stroke: new style.Stroke({ color: "#fff", width: 2 }),
          }),
          text: new style.Text({
            text,
            font: "bold 11px Arial",
            fill: new style.Fill({ color: "#000" }),
            stroke: new style.Stroke({ color: "#fff", width: 3 }),
            offsetY: -20,
            textAlign: "center",
          }),
        })
      )

      vectorSourceRef.current.addFeature(f)
    })
  }

  // 来源值映射：前端选择值 -> 数据库可能的值（支持多种格式）
  const getSourceMatch = (selectedValue: string, dbValue?: string): boolean => {
    if (!dbValue) return false
    
    const dbLower = dbValue.toLowerCase().trim()
    const selectedLower = selectedValue.toLowerCase().trim()
    
    // 直接匹配
    if (dbLower === selectedLower) return true
    
    // 包含匹配（更宽松）
    if (dbLower.includes(selectedLower) || selectedLower.includes(dbLower)) {
      return true
    }
    
    // 特殊映射
    if (selectedValue === "browser") {
      return dbLower === "browser" || 
             dbLower === "浏览器" || 
             dbLower.includes("browser") ||
             dbLower.includes("浏览器")
    }
    if (selectedValue === "wifi") {
      return dbLower === "wifi" || 
             dbLower === "wi-fi" || 
             dbLower === "wifi定位" ||
             dbLower.includes("wifi")
    }
    if (selectedValue === "GPS") {
      return dbLower === "gps" || 
             dbLower === "gps定位" || 
             dbLower.includes("gps")
    }
    
    return false
  }

  const handleSearch = () => {
    handleSearchWithData(locationReports)
  }

  const handleSearchWithData = (data: LocationReport[]) => {
    let filtered = [...data]
    
    // 按用户筛选
    if (selectedUser && selectedUser !== "__all__") {
      filtered = filtered.filter(r => r.username === selectedUser)
    }
    
    // 按来源筛选（支持大小写不敏感和中英文匹配）
    if (selectedSource && selectedSource !== "__all__") {
      filtered = filtered.filter(r => getSourceMatch(selectedSource, r.source))
    }
    
    // 按搜索文本筛选
    if (searchText.trim()) {
      filtered = filtered.filter(
        (r) =>
          r.username.toLowerCase().includes(searchText.toLowerCase()) ||
          r.nickname?.toLowerCase().includes(searchText.toLowerCase()) ||
          r.address?.toLowerCase().includes(searchText.toLowerCase())
      )
    }
    
      setFilteredReports(filtered)
      updateMapMarkers(filtered)
    }

  // 当筛选条件变化时自动更新
  useEffect(() => {
    if (locationReports.length > 0) {
      handleSearchWithData(locationReports)
  }
  }, [selectedUser, selectedSource, searchText, locationReports, showMarkers])

  // 缓存用户列表，确保数据稳定
  const uniqueUsers = useMemo(() => {
    if (!locationReports || !Array.isArray(locationReports) || locationReports.length === 0) {
      return []
    }
    const users: string[] = []
    const seen = new Set<string>()
    
    for (const r of locationReports) {
      const username = r?.username
      if (
        username &&
        typeof username === "string" &&
        username.trim() !== "" &&
        username !== "undefined" &&
        username !== "null" &&
        !seen.has(username)
      ) {
        const cleanUsername = username.trim()
        users.push(cleanUsername)
        seen.add(cleanUsername)
      }
    }
    
    return users
  }, [locationReports])

  // 创建用户选择器的集合
  const userCollection = useMemo(() => {
    const items = [
      { label: "全部用户", value: "__all__" },
      ...uniqueUsers.map((u) => ({ label: u, value: u })),
    ]
    return createListCollection({ items })
  }, [uniqueUsers])

  // 创建来源选择器的集合
  const sourceCollection = useMemo(() => {
    const items = [
      { label: "全部来源", value: "__all__" },
      { label: "GPS", value: "GPS" },
      { label: "浏览器", value: "browser" },
      { label: "WiFi", value: "wifi" },
    ]
    return createListCollection({ items })
  }, [])

  // 确保 selectedUser 的值在 uniqueUsers 中存在，如果不存在则重置
  useEffect(() => {
    if (selectedUser && selectedUser !== "__all__" && uniqueUsers.length > 0) {
      if (!uniqueUsers.includes(selectedUser)) {
        setSelectedUser("")
      }
    } else if (selectedUser && selectedUser !== "__all__" && uniqueUsers.length === 0) {
      setSelectedUser("")
    }
  }, [selectedUser, uniqueUsers])

  const handleReset = () => {
    setSelectedUser("")
    setSelectedSource("")
    setSearchText("")
    setFilteredReports(locationReports)
    updateMapMarkers(locationReports)
    toaster.create({ title: "筛选条件已重置", type: "info" })
  }

  const updateWeatherInfo = async () => {
    // 创建 loading toast 并保存 ID
    const loadingToast = toaster.create({
      title: "正在更新天气信息...",
      description: "请稍候，这可能需要一些时间",
      type: "loading",
      duration: 0,
    })
    
    try {
      const res = await fetch(`${apiBase}/location/reports/batch-update-weather`, { 
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
      
      // 关闭 loading toast
      toaster.dismiss(loadingToast)
      
      if (res.ok) {
        const result = await res.json()
        if (result.success) {
          toaster.create({ 
            title: "天气更新完成", 
            description: result.message || `成功: ${result.updated_count}，失败: ${result.failed_count}`,
            type: "success",
            duration: 5000,
          })
          // 刷新数据
        fetchLocationReports()
        } else {
          toaster.create({ 
            title: "天气更新失败", 
            description: result.message || "更新过程中出现错误",
            type: "error",
          })
        }
      } else {
        const errorData = await res.json().catch(() => ({ detail: "网络错误" }))
        toaster.create({ 
          title: "天气更新失败", 
          description: errorData.detail || errorData.message || "请求失败",
          type: "error",
        })
      }
    } catch (e) {
      // 确保在错误情况下也关闭 loading toast
      toaster.dismiss(loadingToast)
      toaster.create({ 
        title: "天气更新失败", 
        description: e instanceof Error ? e.message : "网络错误，请检查后端服务",
        type: "error",
      })
    }
  }

  const toggleSimulation = async () => {
    try {
      const res = await fetch(`${apiBase}/simulation/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "normal", enabled: !isSimulationEnabled }),
      })
      if (res.ok) {
        setIsSimulationEnabled(!isSimulationEnabled)
        toaster.create({
          title: isSimulationEnabled ? "实时监控已禁用" : "实时监控已启用",
          type: "success",
        })
        if (!isSimulationEnabled) {
          fetchLocationReports()
        }
      }
    } catch (e) {
      toaster.create({ title: "切换失败", type: "error" })
    }
  }

  const testWeatherAlert = async () => {
    try {
      toaster.create({
        title: "正在发送测试预警...",
        type: "info",
      })
      
      const res = await fetch(`${apiBase}/simulation/test-alert?username=user01`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      
      if (res.ok) {
        const result = await res.json()
        toaster.create({
          title: "测试预警已发送",
          description: result.message || "已为 user01 推送测试预警，请查看预警通知",
          type: "success",
          duration: 5000,
        })
        // 刷新数据
        fetchLocationReports()
      } else {
        const errorData = await res.json().catch(() => ({ detail: "请求失败" }))
        toaster.create({
          title: "测试失败",
          description: errorData.detail || errorData.message || "无法发送测试预警",
          type: "error",
        })
      }
    } catch (e) {
      toaster.create({
        title: "测试失败",
        description: e instanceof Error ? e.message : "网络错误",
        type: "error",
      })
    }
  }

  const sendNotification = async (report: LocationReport) => {
    const reportId = report.id
    setSendingNotifications(prev => new Set(prev).add(reportId))
    
    try {
      const res = await fetch(`${apiBase}/sms/send-location-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      })
      
      if (res.ok) {
        const result = await res.json()
        toaster.create({
          title: "短信发送成功",
          description: result.message || `已向 ${report.nickname || report.username} 发送位置通知`,
          type: "success",
        })
      } else {
        const errorData = await res.json().catch(() => ({ detail: "发送失败" }))
        toaster.create({
          title: "短信发送失败",
          description: errorData.detail || errorData.message || "发送通知失败",
          type: "error",
        })
      }
    } catch (e) {
      toaster.create({
        title: "短信发送失败",
        description: e instanceof Error ? e.message : "网络错误",
        type: "error",
      })
    } finally {
      setSendingNotifications(prev => {
        const newSet = new Set(prev)
        newSet.delete(reportId)
        return newSet
      })
    }
  }

  const zoomIn = () => {
    if (mapInstance.current) {
      const view = mapInstance.current.getView()
      view.animate({ zoom: view.getZoom() + 1, duration: 300 })
    }
  }

  const zoomOut = () => {
    if (mapInstance.current) {
      const view = mapInstance.current.getView()
      view.animate({ zoom: view.getZoom() - 1, duration: 300 })
    }
  }

  const resetView = async () => {
    if (mapInstance.current) {
      const { fromLonLat } = await import("ol/proj.js")
      const view = mapInstance.current.getView()
      view.animate({ center: fromLonLat([104.0, 30.0]), zoom: 6, duration: 1000 })
    }
  }

  return (
    <Flex gap={4} h="full" direction={{ base: "column", lg: "row" }}>
      <Toaster />
      {/* 左侧地图 */}
      <Box flex="1" minW={0} position="relative">
        <Heading size="md" mb={2}>
          <FiAlertTriangle style={{ display: "inline", marginRight: 8 }} />
          安全提醒智能体
        </Heading>
        <Box ref={mapRef} w="100%" h="calc(100vh - 150px)" borderRadius="md" borderWidth="1px" />
        <VStack position="absolute" top={16} left={4} gap={2} zIndex={10}>
          <IconButton aria-label="放大" size="sm" onClick={zoomIn}>
            <FiZoomIn />
          </IconButton>
          <IconButton aria-label="缩小" size="sm" onClick={zoomOut}>
            <FiZoomOut />
          </IconButton>
          <IconButton aria-label="重置" size="sm" onClick={resetView}>
            <FiRefreshCw />
          </IconButton>
          <IconButton
            aria-label={showMarkers ? "隐藏标记" : "显示标记"}
            size="sm"
            onClick={() => {
              setShowMarkers(!showMarkers)
              updateMapMarkers(showMarkers ? [] : filteredReports)
            }}
          >
            {showMarkers ? <FiEyeOff /> : <FiEye />}
          </IconButton>
        </VStack>
      </Box>

      {/* 右侧控制面板 */}
      <VStack w={{ base: "full", lg: "380px" }} gap={3} align="stretch" overflowY="auto" maxH="calc(100vh - 100px)">
        {/* WebSocket 状态 */}
        <Card.Root size="sm">
          <Card.Body>
            <HStack>
              <Badge colorPalette={wsStatus === "已连接" ? "green" : "red"}>{wsStatus}</Badge>
              <Text fontSize="xs" flex={1}>
                位置记录: {filteredReports.length} 条
              </Text>
            </HStack>
          </Card.Body>
        </Card.Root>

        {/* 筛选与搜索 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>
              筛选与搜索
            </Heading>
            <Stack gap={2}>
              <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="搜索用户/地址" size="sm" />
              <Select.Root
                collection={userCollection}
                value={(() => {
                  // 确保 value 始终是有效的字符串数组或空数组
                  if (!selectedUser || selectedUser === "") {
                    return []
                  }
                  if (selectedUser === "__all__") {
                    return ["__all__"]
                  }
                  if (Array.isArray(uniqueUsers) && uniqueUsers.includes(selectedUser)) {
                    return [selectedUser]
                  }
                  return []
                })()}
                onValueChange={(details) => {
                  try {
                    if (details?.value && Array.isArray(details.value) && details.value.length > 0) {
                      const newValue = details.value[0]
                      // 确保新值有效
                      if (
                        typeof newValue === "string" &&
                        newValue !== "" &&
                        (newValue === "__all__" || (Array.isArray(uniqueUsers) && uniqueUsers.includes(newValue)))
                      ) {
                        setSelectedUser(newValue)
                      } else {
                        setSelectedUser("")
                      }
                    } else {
                      setSelectedUser("")
                    }
                  } catch (e) {
                    console.error("Select onValueChange error:", e)
                    setSelectedUser("")
                  }
                }}
                size="sm"
              >
                <Select.Trigger>
                  <Select.ValueText placeholder="选择用户" />
                </Select.Trigger>
                <Select.Content>
                  {userCollection.items.map((item) => (
                    <Select.Item key={item.value} item={item}>
                      {item.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <Select.Root
                collection={sourceCollection}
                value={selectedSource && selectedSource !== "" ? [selectedSource] : []}
                onValueChange={(details) => {
                  const newValue = details.value && details.value.length > 0 ? details.value[0] : ""
                  setSelectedSource(newValue || "")
                }}
                size="sm"
              >
                <Select.Trigger>
                  <Select.ValueText placeholder="选择来源" />
                </Select.Trigger>
                <Select.Content>
                  {sourceCollection.items.map((item) => (
                    <Select.Item key={item.value} item={item}>
                      {item.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <HStack>
                <Button size="sm" onClick={handleSearch} colorScheme="blue" flex={1}>
                  搜索
                </Button>
                <Button size="sm" onClick={handleReset} variant="outline" flex={1}>
                  重置
                </Button>
              </HStack>
            </Stack>
          </Card.Body>
        </Card.Root>

        {/* 天气与监控 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>
              <FiCloud style={{ display: "inline", marginRight: 4 }} />
              天气与监控
            </Heading>
            <Stack gap={2}>
              <Button size="sm" onClick={updateWeatherInfo} colorScheme="green">
                批量更新天气
              </Button>
              <Button size="sm" onClick={toggleSimulation} colorScheme={isSimulationEnabled ? "red" : "blue"}>
                {isSimulationEnabled ? "停止监控" : "启动监控"}
              </Button>
              <Button size="sm" onClick={testWeatherAlert} colorScheme="orange" variant="outline">
                测试预警（user01）
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setWeatherAlerts([])
                  toaster.create({ title: "已清空预警列表", type: "info" })
                }}
                colorScheme="gray"
                variant="outline"
              >
                清空预警
              </Button>
            </Stack>
          </Card.Body>
        </Card.Root>

        {/* 实时预警 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>
              <FiBell style={{ display: "inline", marginRight: 4 }} />
              实时预警 ({weatherAlerts.length})
            </Heading>
            <Box maxH="200px" overflowY="auto" fontSize="xs">
              {weatherAlerts.length === 0 && <Text color="gray.500">暂无预警</Text>}
              {weatherAlerts.slice(0, 5).map((alert, idx) => (
                <Box
                  key={idx}
                  p={2}
                  mb={1}
                  borderWidth="1px"
                  borderRadius="md"
                  bg="orange.50"
                  cursor="pointer"
                  _hover={{ bg: "orange.100" }}
                  onClick={async () => {
                    const proj = await import("ol/proj.js")
                    const Feature = (await import("ol/Feature.js")).default
                    const geom = await import("ol/geom.js")
                    const style = await import("ol/style.js")
                    focusOnLocation(alert, proj, Feature, geom, style)
                  }}
                >
                  <Text fontWeight="bold" color="red.500">
                    {alert.nickname || alert.username}
                  </Text>
                  <Text>{alert.location}</Text>
                  <Text color="red.500">{alert.alert_reasons?.join("、")}</Text>
                </Box>
              ))}
            </Box>
          </Card.Body>
        </Card.Root>

        {/* 位置记录列表 */}
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={2}>
              <FiMapPin style={{ display: "inline", marginRight: 4 }} />
              位置记录 ({filteredReports.length})
            </Heading>
            <Box maxH="300px" overflowY="auto" fontSize="xs">
              {loading && <Text>加载中...</Text>}
              {filteredReports.map((r) => {
                const hasAlert = weatherAlerts.some(
                  a => a.user_id === r.user_id || a.username === r.username
                )
                return (
                  <Box
                    key={r.id}
                    p={2}
                    mb={1}
                    borderWidth="1px"
                    borderRadius="md"
                    bg={hasAlert ? "red.50" : "white"}
                    borderColor={hasAlert ? "red.300" : "gray.200"}
                    cursor="pointer"
                    _hover={{ bg: hasAlert ? "red.100" : "gray.50" }}
                    onClick={async () => {
                      if (mapInstance.current) {
                        const { fromLonLat } = await import("ol/proj.js")
                        const view = mapInstance.current.getView()
                        view.animate({
                          center: fromLonLat([r.longitude, r.latitude]),
                          zoom: 12,
                          duration: 1000,
                        })
                      }
                    }}
                  >
                  <HStack justify="space-between" mb={1}>
                    <Text fontWeight="bold">{r.nickname || r.username}</Text>
                    <Badge colorPalette={r.source === "GPS" ? "green" : "blue"}>{r.source}</Badge>
                  </HStack>
                  <Text fontSize="11px" mb={1}>{r.address || "未知地址"}</Text>
                  {r.weather_info && (
                    <Text color="blue.500" fontSize="11px" mb={1}>
                      {r.weather_info.天气} {r.weather_info["温度(℃)"]}°C
                    </Text>
                  )}
                  <HStack justify="space-between" align="center">
                    <Text fontSize="10px" color="gray.500">
                      {new Date(r.create_time).toLocaleString()}
                    </Text>
                    <Button
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        sendNotification(r)
                      }}
                      loading={sendingNotifications.has(r.id)}
                      colorPalette="blue"
                      variant="outline"
                    >
                      <FiBell style={{ marginRight: 4 }} />
                      短信
                    </Button>
                  </HStack>
                </Box>
                )
              })}
            </Box>
          </Card.Body>
        </Card.Root>
      </VStack>
    </Flex>
  )
}
