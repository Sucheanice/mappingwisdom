import {
  Button,
  IconButton,
  Input,
  VStack,
  HStack,
} from "@chakra-ui/react"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { FiEdit } from "react-icons/fi"
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
import { Field } from "../ui/field"

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
}

interface EditLocationButtonProps {
  location: Location
  onSuccess: () => void
}

interface LocationFormData {
  user_id?: number
  username?: string
  nickname?: string
  latitude?: number | string
  longitude?: number | string
  province?: string
  city?: string
  district?: string
  address?: string
  accuracy?: number | string
  source?: string
  device?: string
  ip_address?: string
  remark?: string
}

const EditLocationButton = ({ location, onSuccess }: EditLocationButtonProps) => {
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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<LocationFormData>({
    mode: "onBlur",
  })

  // 当对话框打开时，重置表单
  useEffect(() => {
    if (isOpen) {
      reset({
        user_id: location.user_id,
        username: location.username,
        nickname: location.nickname || "",
        latitude: location.latitude,
        longitude: location.longitude,
        province: location.province || "",
        city: location.city || "",
        district: location.district || "",
        address: location.address || "",
        accuracy: location.accuracy || undefined,
        source: location.source || "",
        device: location.device || "",
        ip_address: location.ip_address || "",
        remark: location.remark || "",
      })
    }
  }, [isOpen, location, reset])

  const onSubmit = async (data: LocationFormData) => {
    setLoading(true)
    try {
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/v1/mysql/locations/${location.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        onSuccess()
        setIsOpen(false)
      } else {
        const errorData = await response.json()
        alert(`更新位置上报失败: ${errorData.detail || "未知错误"}`)
      }
    } catch (error) {
      console.error("更新位置上报失败:", error)
      alert("更新位置上报失败，请检查网络连接")
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
        <IconButton size="sm" variant="ghost" aria-label="编辑位置上报">
          <FiEdit />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>编辑位置上报 - ID: {location.id}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={4}>
              <HStack w="full" gap={4}>
                <Field
                  label="用户ID"
                  required
                  invalid={!!errors.user_id}
                  errorText={errors.user_id?.message}
                  w="50%"
                >
                  <Input
                    type="number"
                    {...register("user_id", {
                      required: "用户ID不能为空",
                      valueAsNumber: true,
                    })}
                    placeholder="请输入用户ID"
                  />
                </Field>

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
                      maxLength: { value: 50, message: "用户名最多50个字符" },
                    })}
                    placeholder="请输入用户名"
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
                  label="省份"
                  invalid={!!errors.province}
                  errorText={errors.province?.message}
                  w="50%"
                >
                  <Input
                    {...register("province", {
                      maxLength: { value: 50, message: "省份最多50个字符" },
                    })}
                    placeholder="请输入省份"
                  />
                </Field>
              </HStack>

              <HStack w="full" gap={4}>
                <Field
                  label="城市"
                  invalid={!!errors.city}
                  errorText={errors.city?.message}
                  w="50%"
                >
                  <Input
                    {...register("city", {
                      maxLength: { value: 50, message: "城市最多50个字符" },
                    })}
                    placeholder="请输入城市"
                  />
                </Field>

                <Field
                  label="区/县"
                  invalid={!!errors.district}
                  errorText={errors.district?.message}
                  w="50%"
                >
                  <Input
                    {...register("district", {
                      maxLength: { value: 50, message: "区/县最多50个字符" },
                    })}
                    placeholder="请输入区/县"
                  />
                </Field>
              </HStack>

              <HStack w="full" gap={4}>
                <Field
                  label="纬度"
                  required
                  invalid={!!errors.latitude}
                  errorText={errors.latitude?.message}
                  w="50%"
                >
                  <Input
                    type="number"
                    step="any"
                    {...register("latitude", {
                      required: "纬度不能为空",
                      valueAsNumber: true,
                    })}
                    placeholder="请输入纬度"
                  />
                </Field>

                <Field
                  label="经度"
                  required
                  invalid={!!errors.longitude}
                  errorText={errors.longitude?.message}
                  w="50%"
                >
                  <Input
                    type="number"
                    step="any"
                    {...register("longitude", {
                      required: "经度不能为空",
                      valueAsNumber: true,
                    })}
                    placeholder="请输入经度"
                  />
                </Field>
              </HStack>

              <Field
                label="完整地址"
                invalid={!!errors.address}
                errorText={errors.address?.message}
                w="full"
              >
                <Input
                  {...register("address", {
                    maxLength: { value: 255, message: "地址最多255个字符" },
                  })}
                  placeholder="请输入完整地址"
                />
              </Field>

              <HStack w="full" gap={4}>
                <Field
                  label="定位精度(米)"
                  invalid={!!errors.accuracy}
                  errorText={errors.accuracy?.message}
                  w="50%"
                >
                  <Input
                    type="number"
                    step="any"
                    {...register("accuracy", {
                      valueAsNumber: true,
                    })}
                    placeholder="请输入定位精度"
                  />
                </Field>

                <Field
                  label="位置来源"
                  invalid={!!errors.source}
                  errorText={errors.source?.message}
                  w="50%"
                >
                  <Input
                    {...register("source", {
                      maxLength: { value: 50, message: "位置来源最多50个字符" },
                    })}
                    placeholder="如：GPS、浏览器、基站、WiFi"
                  />
                </Field>
              </HStack>

              <HStack w="full" gap={4}>
                <Field
                  label="设备信息"
                  invalid={!!errors.device}
                  errorText={errors.device?.message}
                  w="50%"
                >
                  <Input
                    {...register("device", {
                      maxLength: { value: 100, message: "设备信息最多100个字符" },
                    })}
                    placeholder="如：iPhone 15 / Chrome 118"
                  />
                </Field>

                <Field
                  label="IP地址"
                  invalid={!!errors.ip_address}
                  errorText={errors.ip_address?.message}
                  w="50%"
                >
                  <Input
                    {...register("ip_address", {
                      maxLength: { value: 50, message: "IP地址最多50个字符" },
                    })}
                    placeholder="请输入IP地址"
                  />
                </Field>
              </HStack>

              <Field
                label="备注信息"
                invalid={!!errors.remark}
                errorText={errors.remark?.message}
                w="full"
              >
                <Input
                  {...register("remark", {
                    maxLength: { value: 255, message: "备注最多255个字符" },
                  })}
                  placeholder="请输入备注信息"
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
              更新位置上报
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

export default EditLocationButton
