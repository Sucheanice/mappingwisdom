import {
  Container,
  Heading,
  VStack,
  Text,
  Alert,
  Box,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FiAlertCircle } from "react-icons/fi"
import { OpenAPI } from "@/client"

import WeatherSearch from "@/components/Weather/WeatherSearch"
import WeatherDisplay from "@/components/Weather/WeatherDisplay"

export const Route = createFileRoute("/_layout/weather")({
  component: Weather,
})

interface WeatherData {
  城市: string
  天气: string
  温度: string
  温度单位?: string
  风向: string
  风力: string
  湿度: string
  湿度单位?: string
  报告时间: string
}

interface ForecastDay {
  日期: string
  星期: string
  白天天气: string
  白天温度: string
  白天风向: string
  白天风力: string
  夜间天气: string
  夜间温度: string
  夜间风向: string
  夜间风力: string
}

interface ForecastData {
  城市: string
  预报: ForecastDay[]
}

function Weather() {
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null)
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (city: string) => {
    setIsLoading(true)
    setError(null)
    setCurrentWeather(null)
    setForecast(null)

    try {
      // 构建 API base URL
      let apiBase = OpenAPI.BASE || window.location.origin
      // 修复端口：如果使用了错误的端口（8000），替换为正确的端口（8009）
      if (apiBase.includes(':8000')) {
        apiBase = apiBase.replace(':8000', ':8009')
      }
      // 如果当前页面在 5173 端口，后端应该在 8009 端口
      if (window.location.origin.includes(':5173') && !apiBase.includes(':8009') && !apiBase.includes(':8000')) {
        apiBase = window.location.origin.replace(':5173', ':8009')
      }
      // 确保包含 /api/v1
      if (!apiBase.includes('/api/v1')) {
        apiBase = apiBase.replace(/\/+$/, '') + '/api/v1'
      }

      // 获取实时天气
      const currentResponse = await fetch(
        `${apiBase}/weather/current?city=${encodeURIComponent(city)}`
      )
      
      if (!currentResponse.ok) {
        const errorText = await currentResponse.text()
        let errorMessage = "获取天气失败"
        
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.detail || errorData.message || errorMessage
        } catch {
          // 如果不是JSON，使用状态文本
          errorMessage = `${errorMessage} (${currentResponse.status})`
        }
        
        throw new Error(errorMessage)
      }

      const currentData = await currentResponse.json()
      
      console.log("天气API返回数据:", currentData)
      console.log("success:", currentData.success)
      console.log("data:", currentData.data)
      
      if (currentData.success && currentData.data) {
        setCurrentWeather(currentData.data)
      } else {
        throw new Error(currentData.message || "未能获取天气数据")
      }

      // 获取天气预报
      const forecastResponse = await fetch(
        `${apiBase}/weather/forecast?city=${encodeURIComponent(city)}`
      )
      
      if (forecastResponse.ok) {
        const forecastData = await forecastResponse.json()
        if (forecastData.success && forecastData.data) {
          setForecast(forecastData.data)
        }
      }
    } catch (err) {
      console.error("Weather API Error:", err)
      setError(
        err instanceof Error 
          ? err.message 
          : "获取天气信息失败，请检查城市名称是否正确，并确保后端服务正在运行"
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Container maxW="full" py={8}>
      <VStack align="stretch" gap={6}>
        <Box>
          <Heading size="2xl" mb={2}>
            智能天气查询
          </Heading>
          <Text color="gray.600">
            输入城市名称，查询实时天气和未来几天的天气预报
          </Text>
        </Box>

        <WeatherSearch onSearch={handleSearch} isLoading={isLoading} />

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator>
              <FiAlertCircle />
            </Alert.Indicator>
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        <WeatherDisplay currentWeather={currentWeather || undefined} forecast={forecast || undefined} />
      </VStack>
    </Container>
  )
}

