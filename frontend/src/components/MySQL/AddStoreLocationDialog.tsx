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
import { FiSearch } from "react-icons/fi"

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
import { Checkbox } from "../ui/checkbox"

interface AddStoreLocationDialogProps {
  onSuccess: () => void
}

interface StoreLocationFormData {
  address: string
  latitude: number
  longitude: number
  is_visited: boolean
}

const AddStoreLocationDialog = ({ onSuccess }: AddStoreLocationDialogProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<StoreLocationFormData>({
    mode: "onBlur",
    defaultValues: {
      is_visited: false,
    },
  })

  // 搜索地址获取经纬度
  const handleSearchAddress = async () => {
    const address = watch("address")
    if (!address || address.trim() === "") {
      alert("请先输入地址")
      return
    }

    setSearching(true)
    try {
      const response = await fetch("/api/v1/weather/geocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address: address.trim() }),
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          const { location, address: formattedAddress } = result.data
          // 自动填充经纬度
          setValue("latitude", location.latitude)
          setValue("longitude", location.longitude)
          // 可选：使用格式化后的地址（用户可以手动修改）
          if (formattedAddress && formattedAddress !== address) {
            if (confirm(`找到地址：${formattedAddress}\n是否使用此地址替换当前输入？`)) {
              setValue("address", formattedAddress)
            }
          } else {
            alert(`成功获取坐标：\n纬度: ${location.latitude}\n经度: ${location.longitude}`)
          }
        }
      } else {
        const errorData = await response.json()
        alert(`搜索地址失败: ${errorData.detail || "未知错误"}`)
      }
    } catch (error) {
      console.error("搜索地址失败:", error)
      alert("搜索地址失败，请检查网络连接")
    } finally {
      setSearching(false)
    }
  }

  const onSubmit = async (data: StoreLocationFormData) => {
    setLoading(true)
    try {
      const response = await fetch("/api/v1/mysql/store-locations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          is_visited: data.is_visited ? 1 : 0,
        }),
      })

      if (response.ok) {
        onSuccess()
        setIsOpen(false)
        reset()
      } else {
        const errorData = await response.json()
        alert(`创建店铺位置失败: ${errorData.detail || "未知错误"}`)
      }
    } catch (error) {
      console.error("创建店铺位置失败:", error)
      alert("创建店铺位置失败，请检查网络连接")
    } finally {
      setLoading(false)
    }
  }

  const isVisited = watch("is_visited")

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
          新增店铺位置
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>新增店铺位置</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>填写以下信息添加新的店铺位置记录</Text>
            <VStack gap={4}>
              <Field
                label="店铺地址"
                required
                invalid={!!errors.address}
                errorText={errors.address?.message}
                w="full"
              >
                <HStack gap={2}>
                  <Input
                    {...register("address", {
                      required: "店铺地址不能为空",
                      maxLength: { value: 255, message: "地址最多255个字符" },
                    })}
                    placeholder="请输入店铺地址，然后点击搜索获取经纬度"
                    flex={1}
                  />
                  <Button
                    type="button"
                    onClick={handleSearchAddress}
                    loading={searching}
                    colorPalette="blue"
                    variant="outline"
                  >
                    <FiSearch />
                    搜索地址
                  </Button>
                </HStack>
              </Field>

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
                      min: { value: -90, message: "纬度范围: -90 ~ 90" },
                      max: { value: 90, message: "纬度范围: -90 ~ 90" },
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
                      min: { value: -180, message: "经度范围: -180 ~ 180" },
                      max: { value: 180, message: "经度范围: -180 ~ 180" },
                    })}
                    placeholder="请输入经度"
                  />
                </Field>
              </HStack>

              <Field w="full">
                <Checkbox
                  checked={isVisited}
                  onCheckedChange={(e) => setValue("is_visited", e.checked === true)}
                >
                  已到店
                </Checkbox>
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
              创建店铺位置
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

export default AddStoreLocationDialog

