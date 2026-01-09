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
import { FiSearch, FiRefreshCw } from "react-icons/fi"
import { OpenAPI } from "@/client"

import AddUserDialog from "./AddUserDialog"
import EditUserButton from "./EditUserButton"
import DeleteUserButton from "./DeleteUserButton"

interface User {
  id: number
  username: string
  nickname?: string
  email?: string
  mobile?: string
  sex?: number
  avatar?: string
  status?: number
  login_ip?: string
  login_date?: string
  creator?: string
  create_time?: string
  updater?: string
  update_time?: string
  dept_id?: number
  post_ids?: string
  role_ids?: string
  is_admin?: number
}

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<number | null>(null)
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

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        skip: ((currentPage - 1) * pageSize).toString(),
        limit: pageSize.toString(),
      })

      if (searchTerm) params.append("search", searchTerm)
      if (statusFilter !== null) params.append("status", statusFilter.toString())

      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/mysql/users?${params}`)
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      }
    } catch (error) {
      console.error("获取用户列表失败:", error)
    } finally {
      setLoading(false)
    }
  }

  // 获取用户总数
  const fetchUserCount = async () => {
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.append("search", searchTerm)
      if (statusFilter !== null) params.append("status", statusFilter.toString())

      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/mysql/users/count?${params}`)
      if (response.ok) {
        const data = await response.json()
        setTotalCount(data.count)
      }
    } catch (error) {
      console.error("获取用户总数失败:", error)
    }
  }

  // 搜索和筛选
  const handleSearch = () => {
    setCurrentPage(1)
    fetchUsers()
    fetchUserCount()
  }

  // 重置筛选
  const handleReset = () => {
    setSearchTerm("")
    setStatusFilter(null)
    setCurrentPage(1)
  }

  // 刷新数据
  const handleRefresh = () => {
    fetchUsers()
    fetchUserCount()
  }

  // 用户操作成功后的回调
  const handleUserActionSuccess = () => {
    fetchUsers()
    fetchUserCount()
  }

  useEffect(() => {
    fetchUsers()
    fetchUserCount()
  }, [currentPage])

  const getStatusBadge = (status?: number) => {
    switch (status) {
      case 1:
        return <Badge colorPalette="green">启用</Badge>
      case 0:
        return <Badge colorPalette="red">禁用</Badge>
      default:
        return <Badge colorPalette="gray">未知</Badge>
    }
  }

  const getSexText = (sex?: number) => {
    switch (sex) {
      case 1:
        return "男"
      case 2:
        return "女"
      default:
        return "未知"
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <VStack align="stretch" gap={6}>
      {/* 页面标题和操作栏 */}
      <Flex justify="space-between" align="center">
        <Heading size="lg">用户管理</Heading>
        <HStack>
          <Button
            onClick={handleRefresh}
            loading={loading}
          >
            <FiRefreshCw />
            刷新
          </Button>
          <AddUserDialog onSuccess={handleUserActionSuccess} />
        </HStack>
      </Flex>

      {/* 搜索和筛选 */}
      <Card.Root>
        <Card.Body>
          <HStack gap={4} wrap="wrap">
            <Box flex="1" minW="200px">
              <Input
                placeholder="搜索用户名、昵称、邮箱..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              />
            </Box>
            <Box minW="120px">
              <select
                value={statusFilter ?? ""}
                onChange={(e) => setStatusFilter(e.target.value ? Number(e.target.value) : null)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "14px"
                }}
              >
                <option value="">全部状态</option>
                <option value="1">启用</option>
                <option value="0">禁用</option>
              </select>
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

      {/* 用户列表 */}
      <Card.Root>
        <Card.Body p={0}>
          {loading ? (
            <Box p={8} textAlign="center">
              <Text>加载中...</Text>
            </Box>
          ) : users.length === 0 ? (
            <Box p={8} textAlign="center">
              <Text color="gray.500">暂无用户数据</Text>
            </Box>
          ) : (
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>ID</Table.ColumnHeader>
                  <Table.ColumnHeader>用户名</Table.ColumnHeader>
                  <Table.ColumnHeader>昵称</Table.ColumnHeader>
                  <Table.ColumnHeader>邮箱</Table.ColumnHeader>
                  <Table.ColumnHeader>手机</Table.ColumnHeader>
                  <Table.ColumnHeader>性别</Table.ColumnHeader>
                  <Table.ColumnHeader>状态</Table.ColumnHeader>
                  <Table.ColumnHeader>创建时间</Table.ColumnHeader>
                  <Table.ColumnHeader>操作</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {users.map((user) => (
                  <Table.Row key={user.id}>
                    <Table.Cell>{user.id}</Table.Cell>
                    <Table.Cell fontWeight="medium">{user.username}</Table.Cell>
                    <Table.Cell>{user.nickname || "-"}</Table.Cell>
                    <Table.Cell>{user.email || "-"}</Table.Cell>
                    <Table.Cell>{user.mobile || "-"}</Table.Cell>
                    <Table.Cell>{getSexText(user.sex)}</Table.Cell>
                    <Table.Cell>{getStatusBadge(user.status)}</Table.Cell>
                    <Table.Cell>
                      {user.create_time ? new Date(user.create_time).toLocaleString() : "-"}
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={2}>
                        <EditUserButton user={user} onSuccess={handleUserActionSuccess} />
                        <DeleteUserButton user={user} onSuccess={handleUserActionSuccess} />
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

export default UserManagement
