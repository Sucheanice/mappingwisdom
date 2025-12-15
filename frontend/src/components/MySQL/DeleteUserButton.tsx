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

interface User {
  id: number
  username: string
  nickname?: string
  email?: string
}

interface DeleteUserButtonProps {
  user: User
  onSuccess: () => void
}

const DeleteUserButton = ({ user, onSuccess }: DeleteUserButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/v1/mysql/users/${user.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        onSuccess()
        setIsOpen(false)
      } else {
        const errorData = await response.json()
        alert(`删除用户失败: ${errorData.detail || "未知错误"}`)
      }
    } catch (error) {
      console.error("删除用户失败:", error)
      alert("删除用户失败，请检查网络连接")
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
          aria-label="删除用户"
        >
          <FiTrash2 />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); handleDelete(); }}>
          <DialogHeader>
            <DialogTitle>删除用户</DialogTitle>
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
                <Text>您确定要删除以下用户吗？</Text>
                <Text fontWeight="bold">用户名: {user.username}</Text>
                {user.nickname && <Text>昵称: {user.nickname}</Text>}
                {user.email && <Text>邮箱: {user.email}</Text>}
                <Text color="red.500" fontSize="sm">
                  注意：此操作将软删除用户，用户将无法登录系统。
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

export default DeleteUserButton
