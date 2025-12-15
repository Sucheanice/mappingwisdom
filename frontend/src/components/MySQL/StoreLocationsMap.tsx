// 已注释：店铺地图功能暂时停用
// 如需恢复，请取消注释整个文件
/*
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Card,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Badge,
  Spinner,
  Input,
} from "@chakra-ui/react"
import { FiRefreshCw, FiMapPin, FiCheckCircle, FiCircle, FiMap, FiLayers } from "react-icons/fi"
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Overlay from 'ol/Overlay'
import { defaults as defaultControls, FullScreen, ScaleLine } from 'ol/control'
import { Style, Circle as StyleCircle, Fill, Stroke, Text as OlText } from 'ol/style'
import 'ol/ol.css'

const MAP_PADDING: number[] = [60, 60, 60, 360]

type BoolNumber = boolean | 0 | 1

interface StoreLocation {
  id: number
  address: string
  latitude: number | string
  longitude: number | string
  is_visited: BoolNumber
}

const isVisitedTrue = (value: BoolNumber) => {
  if (typeof value === 'boolean') return value
  return Number(value) === 1
}

const StoreLocationsMap = () => {
  const mapRef = useRef<HTMLDivElement>(null)
  const popupContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<Map | null>(null)
  const overlayRef = useRef<Overlay | null>(null)
  const vectorLayerRef = useRef<VectorLayer<any> | null>(null)
  const highlightLayerRef = useRef<VectorLayer<any> | null>(null)

  const streetLayerRef = useRef<TileLayer<OSM> | null>(null)
  const darkLayerRef = useRef<TileLayer<XYZ> | null>(null)

  const [locations, setLocations] = useState<StoreLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<StoreLocation | null>(null)
  const [stats, setStats] = useState({ total: 0, visited: 0, notVisited: 0 })
  const [filterText, setFilterText] = useState('')
  const [baseLayer, setBaseLayer] = useState<'street' | 'dark'>('street')

  const filteredLocations = useMemo(() => {
    if (!filterText.trim()) return locations
    const keyword = filterText.toLowerCase()
    return locations.filter((store) =>
      [store.address, `店铺${store.id}`]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    )
  }, [locations, filterText])

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    try {
      const vectorSource = new VectorSource()
      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: (feature) => {
          const visited = isVisitedTrue(feature.get('is_visited') as BoolNumber)
          const label = feature.get('label') as string
          const color = visited ? '#16a34a' : '#f97316'

          return new Style({
            image: new StyleCircle({
              radius: 9,
              fill: new Fill({ color: `${color}dd` }),
              stroke: new Stroke({ color: '#ffffff', width: 2 }),
            }),
            text: new OlText({
              text: label,
              font: '600 13px "Helvetica Neue", Arial',
              offsetY: -22,
              fill: new Fill({ color: '#111827' }),
              stroke: new Stroke({ color: '#ffffff', width: 3 }),
            }),
          })
        },
      })

      const highlightSource = new VectorSource()
      const highlightLayer = new VectorLayer({
        source: highlightSource,
        style: new Style({
          image: new StyleCircle({
            radius: 12,
            fill: new Fill({ color: '#2563eb44' }),
            stroke: new Stroke({ color: '#2563eb', width: 2 }),
          }),
        }),
      })

      vectorLayerRef.current = vectorLayer
      highlightLayerRef.current = highlightLayer

      streetLayerRef.current = new TileLayer({
        source: new OSM(),
        visible: true,
      })
      darkLayerRef.current = new TileLayer({
        source: new XYZ({
          url: 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          crossOrigin: 'anonymous',
        }),
        visible: false,
      })

      overlayRef.current = new Overlay({
        element: popupContainerRef.current || undefined,
        autoPan: true,
      })

      const map = new Map({
        target: mapRef.current,
        layers: [streetLayerRef.current, darkLayerRef.current, vectorLayer, highlightLayer],
        view: new View({
          center: fromLonLat([104.0668, 30.5728]),
          zoom: 5.5,
          minZoom: 3,
          maxZoom: 18,
        }),
        controls: defaultControls({ attribution: false }).extend([
          new FullScreen(),
          new ScaleLine(),
        ]),
        overlays: overlayRef.current ? [overlayRef.current] : [],
      })

      mapInstanceRef.current = map

      map.on('pointermove', (event) => {
        const hit = map.hasFeatureAtPixel(event.pixel)
        map.getTargetElement().style.cursor = hit ? 'pointer' : ''
      })

      map.on('singleclick', (event) => {
        const feature = map.forEachFeatureAtPixel(event.pixel, (feat) => feat as Feature) as Feature<Point> | undefined

        if (!feature) {
          setSelectedStore(null)
          overlayRef.current?.setPosition(undefined)
          highlightLayer.getSource()?.clear()
          return
        }

        const store = feature.get('storeData') as StoreLocation
        setSelectedStore(store)
        const coordinate = event.coordinate

        overlayRef.current?.setElement(popupContainerRef.current || undefined)
        overlayRef.current?.setPosition(coordinate)

        const highlightSourceCurrent = highlightLayer.getSource()
        highlightSourceCurrent?.clear()
        highlightSourceCurrent?.addFeature(
          new Feature({
            geometry: new Point(coordinate),
          })
        )
      })
    } catch (error) {
      console.error('地图初始化失败:', error)
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined)
        mapInstanceRef.current = null
      }
    }
  }, [])

  const fetchStoreLocations = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/v1/mysql/store-locations/all')
      if (response.ok) {
        const data: StoreLocation[] = await response.json()
        setLocations(data)

        const total = data.length
        const visited = data.filter((loc) => isVisitedTrue(loc.is_visited)).length
        setStats({ total, visited, notVisited: total - visited })

        updateMapMarkers(data)
      }
    } catch (error) {
      console.error('获取店铺位置失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateMapMarkers = (storeLocations: StoreLocation[]) => {
    const vectorLayer = vectorLayerRef.current
    const map = mapInstanceRef.current
    if (!vectorLayer || !map) return

    const vectorSource = vectorLayer.getSource()
    vectorSource?.clear()

    storeLocations.forEach((store) => {
      const lon = Number(store.longitude)
      const lat = Number(store.latitude)
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        const point = new Point(fromLonLat([lon, lat]))
        const feature = new Feature({ geometry: point })
        feature.setProperties({
          label: `店铺 ${store.id}`,
          is_visited: store.is_visited,
          storeData: store,
        })
        vectorSource?.addFeature(feature)
      }
    })

    const extent = vectorSource?.getExtent()
    if (extent && extent[0] !== Infinity) {
      map.getView().fit(extent, {
        padding: MAP_PADDING,
        maxZoom: 15,
        duration: 600,
      })
    }
  }

  const handleToggleBaseLayer = (layer: 'street' | 'dark') => {
    if (layer === baseLayer) return
    setBaseLayer(layer)
    streetLayerRef.current?.setVisible(layer === 'street')
    darkLayerRef.current?.setVisible(layer === 'dark')
  }

  const flyToStore = (store: StoreLocation) => {
    const map = mapInstanceRef.current
    const highlightLayer = highlightLayerRef.current
    if (!map || !highlightLayer) return

    const lon = Number(store.longitude)
    const lat = Number(store.latitude)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return

    const coordinate = fromLonLat([lon, lat])
    map.getView().animate({ center: coordinate, zoom: 15, duration: 600 })

    overlayRef.current?.setElement(popupContainerRef.current || undefined)
    overlayRef.current?.setPosition(coordinate)

    const highlightSource = highlightLayer.getSource()
    highlightSource?.clear()
    highlightSource?.addFeature(new Feature({ geometry: new Point(coordinate) }))

    setSelectedStore(store)
  }

  useEffect(() => {
    fetchStoreLocations()
  }, [])

  const formatCoordinate = (coord: number | string) => {
    if (coord === null || coord === undefined) return '-'
    const num = Number(coord)
    return Number.isFinite(num) ? num.toFixed(6) : '-'
  }

  return (
    <Flex gap={4} h="calc(100vh - 120px)">
      <Box w="360px" overflow="hidden">
        <VStack align="stretch" gap={4} h="full">
          <Card.Root flexShrink={0}>
            <Card.Header>
              <Flex justify="space-between" align="center">
                <Heading size="md">店铺统计</Heading>
                <Button size="xs" variant="ghost" onClick={() => handleToggleBaseLayer(baseLayer === 'street' ? 'dark' : 'street')}>
                  <HStack gap={1}>
                    <FiLayers />
                    <Text>{baseLayer === 'street' ? '夜间地图' : '街道地图'}</Text>
                  </HStack>
                </Button>
              </Flex>
            </Card.Header>
            <Card.Body>
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                  <Text fontSize="sm">总店铺数</Text>
                  <Badge colorPalette="blue" fontSize="md" px={3}>{stats.total}</Badge>
                </HStack>
                <HStack justify="space-between">
                  <HStack gap={2}>
                    <FiCheckCircle color="#16a34a" />
                    <Text fontSize="sm">已到店</Text>
                  </HStack>
                  <Badge colorPalette="green" fontSize="md" px={3}>{stats.visited}</Badge>
                </HStack>
                <HStack justify="space-between">
                  <HStack gap={2}>
                    <FiCircle color="#f97316" />
                    <Text fontSize="sm">未到店</Text>
                  </HStack>
                  <Badge colorPalette="orange" fontSize="md" px={3}>{stats.notVisited}</Badge>
                </HStack>
              </VStack>
            </Card.Body>
          </Card.Root>

          <Card.Root flexShrink={0}>
            <Card.Body>
              <VStack gap={3}>
                <Input
                  placeholder="输入地址或店铺编号搜索..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  size="sm"
                />
                <Button onClick={fetchStoreLocations} loading={loading} size="sm">
                  <HStack gap={1}>
                    <FiRefreshCw />
                    <Text>刷新数据</Text>
                  </HStack>
                </Button>
              </VStack>
            </Card.Body>
          </Card.Root>

          <Card.Root flex={1} display="flex" overflow="hidden">
            <Card.Header>
              <Heading size="md">店铺列表</Heading>
            </Card.Header>
            <Card.Body p={0} overflowY="auto">
              {loading ? (
                <Box p={8} textAlign="center">
                  <Spinner size="lg" />
                  <Text mt={2}>地图数据加载中...</Text>
                </Box>
              ) : filteredLocations.length === 0 ? (
                <Box p={8} textAlign="center" color="gray.500">
                  未找到匹配的店铺
                </Box>
              ) : (
                <VStack align="stretch" gap={0}>
                  {filteredLocations.map((store) => {
                    const visited = isVisitedTrue(store.is_visited)
                    return (
                      <Box
                        key={store.id}
                        px={4}
                        py={3}
                        borderBottomWidth="1px"
                        cursor="pointer"
                        bg={selectedStore?.id === store.id ? 'blue.50' : 'transparent'}
                        _hover={{ bg: selectedStore?.id === store.id ? 'blue.100' : 'gray.50' }}
                        onClick={() => flyToStore(store)}
                      >
                        <HStack justify="space-between" mb={1}>
                          <HStack gap={2}>
                            <FiMapPin color={visited ? '#16a34a' : '#f97316'} />
                            <Text fontWeight="600">店铺 {store.id}</Text>
                          </HStack>
                          <Badge colorPalette={visited ? 'green' : 'orange'}>
                            {visited ? '已到店' : '未到店'}
                          </Badge>
                        </HStack>
                        <Text fontSize="sm" color="gray.600">
                          {store.address}
                        </Text>
                        <Text fontSize="xs" color="gray.400" mt={1} fontFamily="mono">
                          {formatCoordinate(store.longitude)}, {formatCoordinate(store.latitude)}
                        </Text>
                      </Box>
                    )
                  })}
                </VStack>
              )}
            </Card.Body>
          </Card.Root>
        </VStack>
      </Box>

      <Box flex={1} position="relative">
        <Card.Root h="full">
          <Card.Header>
            <Flex justify="space-between" align="center">
              <Heading size="md" display="flex" alignItems="center" gap={2}>
                <FiMap /> 店铺位置地图
              </Heading>
              <HStack gap={4} fontSize="sm" color="gray.500">
                <HStack gap={2}>
                  <Box w={3} h={3} borderRadius="full" bg="orange.500" />
                  <Text>未到店</Text>
                </HStack>
                <HStack gap={2}>
                  <Box w={3} h={3} borderRadius="full" bg="green.500" />
                  <Text>已到店</Text>
                </HStack>
              </HStack>
            </Flex>
          </Card.Header>
          <Card.Body p={0} position="relative">
            <Box ref={mapRef} w="full" h="100%" minH="520px" borderRadius="md" overflow="hidden" />

            <Box
              ref={popupContainerRef}
              position="absolute"
              transform="translate(-50%, calc(-100% - 16px))"
              pointerEvents="none"
              minW="260px"
              zIndex={1000}
            >
              {selectedStore && (
                <Card.Root pointerEvents="auto" shadow="lg">
                  <Card.Header py={3}>
                    <HStack justify="space-between">
                      <Heading size="sm">店铺 {selectedStore.id}</Heading>
                      <Badge colorPalette={isVisitedTrue(selectedStore.is_visited) ? 'green' : 'orange'}>
                        {isVisitedTrue(selectedStore.is_visited) ? '已到店' : '未到店'}
                      </Badge>
                    </HStack>
                  </Card.Header>
                  <Card.Body py={3}>
                    <VStack align="stretch" gap={2}>
                      <Box>
                        <Text fontSize="xs" color="gray.500">店铺地址</Text>
                        <Text fontSize="sm" lineHeight="short">
                          {selectedStore.address}
                        </Text>
                      </Box>
                      <Box borderTopWidth="1px" borderColor="gray.100" pt={2}>
                        <HStack justify="space-between">
                          <Text fontSize="xs" color="gray.500">经度</Text>
                          <Text fontSize="sm" fontFamily="mono">{formatCoordinate(selectedStore.longitude)}</Text>
                        </HStack>
                        <HStack justify="space-between" mt={1}>
                          <Text fontSize="xs" color="gray.500">纬度</Text>
                          <Text fontSize="sm" fontFamily="mono">{formatCoordinate(selectedStore.latitude)}</Text>
                        </HStack>
                      </Box>
                    </VStack>
                  </Card.Body>
                </Card.Root>
              )}
            </Box>

            {!selectedStore && !loading && (
              <Box position="absolute" top={4} right={4} px={3} py={2} bg="white" shadow="md" borderRadius="md" color="gray.600">
                点击地图标记或左侧列表可查看店铺详情
              </Box>
            )}
          </Card.Body>
        </Card.Root>
      </Box>
    </Flex>
  )
}

export default StoreLocationsMap
*/
