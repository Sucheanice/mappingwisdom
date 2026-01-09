import {
  Button,
  IconButton,
  Text,
  VStack,
  Alert,
} from "@chakra-ui/react"
import { useState } from "react"
import { FiTrash2, FiAlertTriangle } from "react-icons/fi"
import { OpenAPI } from "@/client"

import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"

interface Location {
  id: number
  username: string
  nickname?: string
  city?: string
  address?: string
  create_time?: string
}

interface DeleteLocationButtonProps {
  location: Location
  onSuccess: () => void
}

const DeleteLocationButton = ({ location, onSuccess }: DeleteLocationButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

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

  const handleDelete = async () => {
    setLoading(true)
    try {
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/mysql/locations/${location.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        onSuccess()
        setIsOpen(false)
      } else {
        const errorData = await response.json()
        alert(`删除位置上报失败: ${errorData.detail || "未知错误"}`)
      }
    } catch (error) {
      console.error("删除位置上报失败:", error)
      alert("删除位置上报失败，请检查网络连接")
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "md" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <IconButton
          size="sm"
          variant="ghost"
          colorPalette="red"
          aria-label="删除位置上报"
        >
          <FiTrash2 />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); handleDelete(); }}>
          <DialogHeader>
            <DialogTitle>删除位置上报</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={4}>
              <Alert.Root status="warning">
                <Alert.Indicator>
                  <FiAlertTriangle />
                </Alert.Indicator>
                <Alert.Title>确认删除</Alert.Title>
              </Alert.Root>

              <VStack align="start" gap={2}>
                <Text>您确定要删除以下位置上报记录吗？</Text>
                <Text fontWeight="bold">ID: {location.id}</Text>
                <Text>用户: {location.username}</Text>
                {location.nickname && <Text>昵称: {location.nickname}</Text>}
                {location.city && <Text>城市: {location.city}</Text>}
                {location.address && (
                  <Text fontSize="sm" color="gray.500">
                    地址: {location.address}
                  </Text>
                )}
                {location.create_time && (
                  <Text fontSize="sm" color="gray.500">
                    上报时间: {new Date(location.create_time).toLocaleString()}
                  </Text>
                )}
                <Text color="red.500" fontSize="sm">
                  注意：此操作将永久删除该位置上报记录，无法恢复。
                </Text>
              </VStack>
            </VStack>
          </DialogBody>

          <DialogFooter gap={2}>
            <DialogActionTrigger asChild>
              <Button variant="subtle" colorPalette="gray" disabled={loading}>
                取消
              </Button>
            </DialogActionTrigger>
            <Button
              type="submit"
              colorPalette="red"
              loading={loading}
            >
              确认删除
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

export default DeleteLocationButton
