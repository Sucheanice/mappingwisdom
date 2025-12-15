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
  Badge,
} from "@chakra-ui/react"
import { useState, useEffect } from "react"
// import { Link } from "@tanstack/react-router" // 已注释：地图功能暂时停用
import { FiSearch, FiRefreshCw, FiMapPin } from "react-icons/fi"
// import { FiMap } from "react-icons/fi" // 已注释：地图功能暂时停用

import AddStoreLocationDialog from "./AddStoreLocationDialog"
import EditStoreLocationButton from "./EditStoreLocationButton"
import DeleteStoreLocationButton from "./DeleteStoreLocationButton"

interface StoreLocation {
  id: number
  address: string
  latitude: number | string
  longitude: number | string
  is_visited: boolean | number
}

const StoreLocationManagement = () => {
  const [locations, setLocations] = useState<StoreLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [batchUpdating, setBatchUpdating] = useState(false)

  const pageSize = 10

  // 获取店铺位置列表
  const fetchStoreLocations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        skip: ((currentPage - 1) * pageSize).toString(),
        limit: pageSize.toString(),
      })

      if (searchTerm) params.append("address", searchTerm)

      const response = await fetch(`/api/v1/mysql/store-locations?${params}`)
      if (response.ok) {
        const data = await response.json()
        setLocations(data)
      }
    } catch (error) {
      console.error("获取店铺位置列表失败:", error)
    } finally {
      setLoading(false)
    }
  }

  // 获取店铺位置总数
  const fetchStoreLocationCount = async () => {
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.append("address", searchTerm)

      const response = await fetch(`/api/v1/mysql/store-locations/count?${params}`)
      if (response.ok) {
        const data = await response.json()
        setTotalCount(data.count)
      }
    } catch (error) {
      console.error("获取店铺位置总数失败:", error)
    }
  }

  // 搜索和筛选
  const handleSearch = () => {
    setCurrentPage(1)
    fetchStoreLocations()
    fetchStoreLocationCount()
  }

  // 重置筛选
  const handleReset = () => {
    setSearchTerm("")
    setCurrentPage(1)
  }

  // 刷新数据
  const handleRefresh = () => {
    fetchStoreLocations()
    fetchStoreLocationCount()
  }

  // 位置操作成功后的回调
  const handleStoreLocationActionSuccess = () => {
    fetchStoreLocations()
    fetchStoreLocationCount()
  }

  // 批量更新所有店铺的经纬度
  const handleBatchUpdateCoordinates = async () => {
    if (!confirm("确定要批量更新所有店铺的经纬度吗？\n\n此操作会根据地址调用高德地图API获取经纬度并更新数据库。\n可能需要较长时间，请耐心等待。")) {
      return
    }

    setBatchUpdating(true)
    try {
      const response = await fetch("/api/v1/mysql/store-locations/batch-update-coordinates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        const result = await response.json()
        let message = result.message || "批量更新完成"
        
        // 如果有失败的项，显示详细信息
        if (result.failed_count > 0 && result.failed_items && result.failed_items.length > 0) {
          const failedList = result.failed_items
            .slice(0, 5)  // 只显示前5个失败项
            .map((item: any) => `ID ${item.id}: ${item.address} - ${item.reason}`)
            .join("\n")
          
          const more = result.failed_items.length > 5 ? `\n...还有 ${result.failed_items.length - 5} 个失败` : ""
          
          alert(`${message}\n\n失败的店铺：\n${failedList}${more}`)
        } else {
          alert(message)
        }
        
        // 刷新列表
        fetchStoreLocations()
      } else {
        const errorData = await response.json()
        alert(`批量更新失败: ${errorData.detail || "未知错误"}`)
      }
    } catch (error) {
      console.error("批量更新失败:", error)
      alert("批量更新失败，请检查网络连接")
    } finally {
      setBatchUpdating(false)
    }
  }

  useEffect(() => {
    fetchStoreLocations()
    fetchStoreLocationCount()
  }, [currentPage])

  const formatCoordinate = (coord: number | string) => {
    if (coord === null || coord === undefined) return "-"
    const num = typeof coord === 'string' ? parseFloat(coord) : coord
    return isNaN(num) ? "-" : num.toFixed(6)
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <VStack align="stretch" gap={6}>
      {/* 页面标题和操作栏 */}
      <Flex justify="space-between" align="center">
        <Heading size="lg">店铺位置管理</Heading>
        <HStack>
          {/* 已注释：地图功能暂时停用
          <Link to="/storeLocationsMap">
            <Button colorPalette="teal" variant="outline">
              <FiMap />
              查看地图
            </Button>
          </Link>
          */}
          <Button
            onClick={handleRefresh}
            loading={loading}
          >
            <FiRefreshCw />
            刷新
          </Button>
          <Button
            onClick={handleBatchUpdateCoordinates}
            loading={batchUpdating}
            colorPalette="orange"
          >
            <FiMapPin />
            一键更新经纬度
          </Button>
          <AddStoreLocationDialog onSuccess={handleStoreLocationActionSuccess} />
        </HStack>
      </Flex>

      {/* 搜索和筛选 */}
      <Card.Root>
        <Card.Body>
          <HStack gap={4} wrap="wrap">
            <Box minW="200px" maxW="300px">
              <Input
                placeholder="搜索地址..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
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

      {/* 店铺位置列表 */}
      <Card.Root>
        <Card.Body p={0}>
          {loading ? (
            <Box p={8} textAlign="center">
              <Text>加载中...</Text>
            </Box>
          ) : locations.length === 0 ? (
            <Box p={8} textAlign="center">
              <Text color="gray.500">暂无店铺位置数据</Text>
            </Box>
          ) : (
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>ID</Table.ColumnHeader>
                  <Table.ColumnHeader>地址</Table.ColumnHeader>
                  <Table.ColumnHeader>经度</Table.ColumnHeader>
                  <Table.ColumnHeader>纬度</Table.ColumnHeader>
                  <Table.ColumnHeader>到店状态</Table.ColumnHeader>
                  <Table.ColumnHeader>操作</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {locations.map((location) => (
                  <Table.Row key={location.id}>
                    <Table.Cell>{location.id}</Table.Cell>
                    <Table.Cell>
                      <Text maxW="300px">{location.address}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {formatCoordinate(location.longitude)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">
                        {formatCoordinate(location.latitude)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {location.is_visited ? (
                        <Badge colorPalette="green">已到店</Badge>
                      ) : (
                        <Badge colorPalette="gray">未到店</Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={2}>
                        <EditStoreLocationButton 
                          location={location} 
                          onSuccess={handleStoreLocationActionSuccess} 
                        />
                        <DeleteStoreLocationButton 
                          location={location} 
                          onSuccess={handleStoreLocationActionSuccess} 
                        />
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

export default StoreLocationManagement

