import {
  Button,
  IconButton,
  Text,
  VStack,
  Alert,
} from "@chakra-ui/react"
import { useState } from "react"
import { FiTrash2, FiAlertTriangle } from "react-icons/fi"

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

interface StoreLocation {
  id: number
  address: string
  latitude: number | string
  longitude: number | string
  is_visited: boolean | number
}

interface DeleteStoreLocationButtonProps {
  location: StoreLocation
  onSuccess: () => void
}

const DeleteStoreLocationButton = ({ location, onSuccess }: DeleteStoreLocationButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/v1/mysql/store-locations/${location.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        onSuccess()
        setIsOpen(false)
      } else {
        const errorData = await response.json()
        alert(`删除店铺位置失败: ${errorData.detail || "未知错误"}`)
      }
    } catch (error) {
      console.error("删除店铺位置失败:", error)
      alert("删除店铺位置失败，请检查网络连接")
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
          aria-label="删除店铺位置"
        >
          <FiTrash2 />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); handleDelete(); }}>
          <DialogHeader>
            <DialogTitle>删除店铺位置</DialogTitle>
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
                <Text>您确定要删除以下店铺位置记录吗？</Text>
                <Text fontWeight="bold">ID: {location.id}</Text>
                <Text>地址: {location.address}</Text>
                <Text fontSize="sm" color="gray.500">
                  坐标: {location.longitude}, {location.latitude}
                </Text>
                <Text fontSize="sm" color="gray.500">
                  状态: {location.is_visited ? '已到店' : '未到店'}
                </Text>
                <Text color="red.500" fontSize="sm">
                  注意：此操作将永久删除该店铺位置记录，无法恢复。
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

export default DeleteStoreLocationButton

