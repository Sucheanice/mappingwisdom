import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Input,
  Table,
  Text,
  VStack,
  HStack,
} from "@chakra-ui/react"
import { useState, useEffect } from "react"
import { FiSearch, FiRefreshCw } from "react-icons/fi"
import { OpenAPI } from "@/client"

import AddLocationDialog from "./AddLocationDialog"
import EditLocationButton from "./EditLocationButton"
import DeleteLocationButton from "./DeleteLocationButton"

interface Location {
  id: number
  user_id: number
  username: string
  nickname?: string
  latitude: number | string
  longitude: number | string
  province?: string
  city?: string
  district?: string
  address?: string
  accuracy?: number | string
  source?: string
  device?: string
  ip_address?: string
  remark?: string
  create_time?: string
  weather_info?: any
  weather_time?: string
}

const LocationManagement = () => {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [cityFilter, setCityFilter] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const pageSize = 10

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

  // 获取位置上报列表
  const fetchLocations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        skip: ((currentPage - 1) * pageSize).toString(),
        limit: pageSize.toString(),
      })

      if (searchTerm) params.append("username", searchTerm)
      if (cityFilter) params.append("city", cityFilter)
      if (startDate) params.append("start_date", startDate)
      if (endDate) params.append("end_date", endDate)

      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/mysql/locations?${params}`)
      if (response.ok) {
        const data = await response.json()
        setLocations(data)
      }
    } catch (error) {
      console.error("获取位置上报列表失败:", error)
    } finally {
      setLoading(false)
    }
  }

  // 获取位置上报总数
  const fetchLocationCount = async () => {
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.append("username", searchTerm)
      if (cityFilter) params.append("city", cityFilter)
      if (startDate) params.append("start_date", startDate)
      if (endDate) params.append("end_date", endDate)

      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/mysql/locations/count?${params}`)
      if (response.ok) {
        const data = await response.json()
        setTotalCount(data.count)
      }
    } catch (error) {
      console.error("获取位置上报总数失败:", error)
    }
  }

  // 搜索和筛选
  const handleSearch = () => {
    setCurrentPage(1)
    fetchLocations()
    fetchLocationCount()
  }

  // 重置筛选
  const handleReset = () => {
    setSearchTerm("")
    setCityFilter("")
    setStartDate("")
    setEndDate("")
    setCurrentPage(1)
  }

  // 刷新数据
  const handleRefresh = () => {
    fetchLocations()
    fetchLocationCount()
  }

  // 位置上报操作成功后的回调
  const handleLocationActionSuccess = () => {
    fetchLocations()
    fetchLocationCount()
  }

  useEffect(() => {
    fetchLocations()
    fetchLocationCount()
  }, [currentPage])

  const formatCoordinate = (coord: number | string) => {
    if (coord === null || coord === undefined) return "-"
    const num = typeof coord === 'string' ? parseFloat(coord) : coord
    return isNaN(num) ? "-" : num.toFixed(6)
  }

  const formatDateTime = (dateTime?: string) => {
    if (!dateTime) return "-"
    return new Date(dateTime).toLocaleString()
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <VStack align="stretch" gap={6}>
      {/* 页面标题和操作栏 */}
      <Flex justify="space-between" align="center">
        <Heading size="lg">位置上报管理</Heading>
        <HStack>
          <Button
            onClick={handleRefresh}
            loading={loading}
          >
            <FiRefreshCw />
            刷新
          </Button>
          <AddLocationDialog onSuccess={handleLocationActionSuccess} />
        </HStack>
      </Flex>

      {/* 搜索和筛选 */}
      <Card.Root>
        <Card.Body>
          <HStack gap={4} wrap="wrap">
            <Box minW="150px" maxW="200px">
              <Input
                placeholder="搜索用户名..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              />
            </Box>
            <Box minW="120px" maxW="150px">
              <Input
                placeholder="筛选城市..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />
            </Box>
            <Box minW="140px">
              <Input
                type="date"
                placeholder="开始日期"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Box>
            <Box minW="140px">
              <Input
                type="date"
                placeholder="结束日期"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Box>
            <Button onClick={handleSearch} loading={loading}>
              <FiSearch />
              搜索
            </Button>
            <Button variant="outline" onClick={handleReset}>
              重置
            </Button>
          </HStack>
        </Card.Body>
      </Card.Root>

      {/* 位置上报列表 */}
      <Card.Root>
        <Card.Body p={0}>
          {loading ? (
            <Box p={8} textAlign="center">
              <Text>加载中...</Text>
            </Box>
          ) : locations.length === 0 ? (
            <Box p={8} textAlign="center">
              <Text color="gray.500">暂无位置上报数据</Text>
            </Box>
          ) : (
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>ID</Table.ColumnHeader>
                  <Table.ColumnHeader>用户</Table.ColumnHeader>
                  <Table.ColumnHeader>位置</Table.ColumnHeader>
                  <Table.ColumnHeader>坐标</Table.ColumnHeader>
                  <Table.ColumnHeader>地址</Table.ColumnHeader>
                  <Table.ColumnHeader>设备</Table.ColumnHeader>
                  <Table.ColumnHeader>上报时间</Table.ColumnHeader>
                  <Table.ColumnHeader>操作</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {locations.map((location) => (
                  <Table.Row key={location.id}>
                    <Table.Cell>{location.id}</Table.Cell>
                    <Table.Cell>
                      <VStack align="start" gap={0}>
                        <Text fontWeight="medium">{location.username}</Text>
                        {location.nickname && (
                          <Text fontSize="sm" color="gray.500">
                            {location.nickname}
                          </Text>
                        )}
                      </VStack>
                    </Table.Cell>
                    <Table.Cell>
                      <VStack align="start" gap={0}>
                        {location.city && (
                          <Text fontSize="sm">{location.city}</Text>
                        )}
                        {location.district && (
                          <Text fontSize="xs" color="gray.500">
                            {location.district}
                          </Text>
                        )}
                      </VStack>
                    </Table.Cell>
                    <Table.Cell>
                      <VStack align="start" gap={0}>
                        <Text fontSize="sm">
                          {formatCoordinate(location.latitude)}, {formatCoordinate(location.longitude)}
                        </Text>
                        {location.accuracy && (
                          <Text fontSize="xs" color="gray.500">
                            精度: {typeof location.accuracy === 'number' ? location.accuracy.toFixed(2) : location.accuracy}m
                          </Text>
                        )}
                      </VStack>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm" maxW="200px">
                        {location.address || "-"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <VStack align="start" gap={0}>
                        {location.device && (
                          <Text fontSize="sm">{location.device}</Text>
                        )}
                        {location.source && (
                          <Text fontSize="xs" color="gray.500">
                            {location.source}
                          </Text>
                        )}
                      </VStack>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {formatDateTime(location.create_time)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={2}>
                        <EditLocationButton location={location} onSuccess={handleLocationActionSuccess} />
                        <DeleteLocationButton location={location} onSuccess={handleLocationActionSuccess} />
                      </HStack>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Card.Body>
      </Card.Root>

      {/* 分页 */}
      {totalPages > 1 && (
        <Flex justify="center" gap={2}>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
          >
            上一页
          </Button>
          <Text alignSelf="center">
            第 {currentPage} 页，共 {totalPages} 页（总计 {totalCount} 条）
          </Text>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            下一页
          </Button>
        </Flex>
      )}

    </VStack>
  )
}

export default LocationManagement
