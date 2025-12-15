import {
  Button,
  Input,
  VStack,
  HStack,
  Text,
} from "@chakra-ui/react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { FaPlus } from "react-icons/fa"

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
import { Field } from "../ui/field"

interface AddUserDialogProps {
  onSuccess: () => void
}

interface UserFormData {
  username: string
  password?: string
  nickname?: string
  email?: string
  mobile?: string
  sex?: number
  avatar?: string
  status?: number
  dept_id?: number
  post_ids?: string
  role_ids?: string
  is_admin?: number
}

const AddUserDialog = ({ onSuccess }: AddUserDialogProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<UserFormData>({
    mode: "onBlur",
    defaultValues: {
      status: 1,
      is_admin: 0,
    },
  })

  const onSubmit = async (data: UserFormData) => {
    setLoading(true)
    try {
      const response = await fetch("/api/v1/mysql/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        onSuccess()
        setIsOpen(false)
        reset()
      } else {
        const errorData = await response.json()
        alert(`创建用户失败: ${errorData.detail || "未知错误"}`)
      }
    } catch (error) {
      console.error("创建用户失败:", error)
      alert("创建用户失败，请检查网络连接")
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "lg" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <Button colorPalette="blue">
          <FaPlus fontSize="16px" />
          新增用户
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>新增用户</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>填写以下信息添加新用户</Text>
            <VStack gap={4}>
              <HStack w="full" gap={4}>
                <Field
                  label="用户名"
                  required
                  invalid={!!errors.username}
                  errorText={errors.username?.message}
                  w="50%"
                >
                  <Input
                    {...register("username", {
                      required: "用户名不能为空",
                      minLength: { value: 2, message: "用户名至少2个字符" },
                      maxLength: { value: 50, message: "用户名最多50个字符" },
                    })}
                    placeholder="请输入用户名"
                  />
                </Field>

                <Field
                  label="密码"
                  invalid={!!errors.password}
                  errorText={errors.password?.message}
                  w="50%"
                >
                  <Input
                    type="password"
                    {...register("password", {
                      minLength: { value: 6, message: "密码至少6个字符" },
                    })}
                    placeholder="请输入密码（可选）"
                  />
                </Field>
              </HStack>

              <HStack w="full" gap={4}>
                <Field
                  label="昵称"
                  invalid={!!errors.nickname}
                  errorText={errors.nickname?.message}
                  w="50%"
                >
                  <Input
                    {...register("nickname", {
                      maxLength: { value: 100, message: "昵称最多100个字符" },
                    })}
                    placeholder="请输入昵称"
                  />
                </Field>

                <Field
                  label="邮箱"
                  invalid={!!errors.email}
                  errorText={errors.email?.message}
                  w="50%"
                >
                  <Input
                    type="email"
                    {...register("email", {
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "请输入有效的邮箱地址",
                      },
                    })}
                    placeholder="请输入邮箱"
                  />
                </Field>
              </HStack>

              <HStack w="full" gap={4}>
                <Field
                  label="手机号"
                  invalid={!!errors.mobile}
                  errorText={errors.mobile?.message}
                  w="50%"
                >
                  <Input
                    {...register("mobile", {
                      pattern: {
                        value: /^1[3-9]\d{9}$/,
                        message: "请输入有效的手机号",
                      },
                    })}
                    placeholder="请输入手机号"
                  />
                </Field>

                <Field
                  label="性别"
                  w="50%"
                >
                  <select
                    {...register("sex")}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "14px"
                    }}
                  >
                    <option value="">请选择性别</option>
                    <option value="1">男</option>
                    <option value="2">女</option>
                  </select>
                </Field>
              </HStack>

              <HStack w="full" gap={4}>
                <Field
                  label="部门ID"
                  invalid={!!errors.dept_id}
                  errorText={errors.dept_id?.message}
                  w="50%"
                >
                  <Input
                    type="number"
                    {...register("dept_id", {
                      valueAsNumber: true,
                    })}
                    placeholder="请输入部门ID"
                  />
                </Field>

                <Field
                  label="状态"
                  w="50%"
                >
                  <select
                    {...register("status", { valueAsNumber: true })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "14px"
                    }}
                  >
                    <option value={1}>启用</option>
                    <option value={0}>禁用</option>
                  </select>
                </Field>
              </HStack>

              <HStack w="full" gap={4}>
                <Field
                  label="岗位ID"
                  invalid={!!errors.post_ids}
                  errorText={errors.post_ids?.message}
                  w="50%"
                >
                  <Input
                    {...register("post_ids", {
                      maxLength: { value: 255, message: "岗位ID最多255个字符" },
                    })}
                    placeholder="请输入岗位ID，多个用逗号分隔"
                  />
                </Field>

                <Field
                  label="角色ID"
                  invalid={!!errors.role_ids}
                  errorText={errors.role_ids?.message}
                  w="50%"
                >
                  <Input
                    {...register("role_ids", {
                      maxLength: { value: 255, message: "角色ID最多255个字符" },
                    })}
                    placeholder="请输入角色ID，多个用逗号分隔"
                  />
                </Field>
              </HStack>

              <Field
                label="头像URL"
                invalid={!!errors.avatar}
                errorText={errors.avatar?.message}
                w="full"
              >
                <Input
                  {...register("avatar", {
                    maxLength: { value: 255, message: "头像URL最多255个字符" },
                  })}
                  placeholder="请输入头像URL"
                />
              </Field>
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
              colorPalette="blue"
              loading={loading}
              disabled={!isValid}
            >
              创建用户
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

export default AddUserDialog