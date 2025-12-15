import {
  Box,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
  VStack,
  HStack,
  Badge,
} from "@chakra-ui/react"
import {
  FiCloud,
  FiWind,
  FiDroplet,
  FiThermometer,
  FiCalendar,
} from "react-icons/fi"

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

interface WeatherDisplayProps {
  currentWeather?: WeatherData
  forecast?: {
    城市: string
    预报: ForecastDay[]
  }
}

const WeatherDisplay = ({ currentWeather, forecast }: WeatherDisplayProps) => {
  if (!currentWeather && !forecast) {
    return null
  }

  return (
    <VStack align="stretch" gap={6} mt={8}>
      {/* 实时天气 */}
      {currentWeather && (
        <Card.Root>
          <Card.Header>
            <Heading size="lg">{currentWeather.城市} - 实时天气</Heading>
          </Card.Header>
          <Card.Body>
            <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={6}>
              <Box>
                <VStack align="start">
                  <HStack>
                    <FiCloud size={24} />
                    <Text fontSize="2xl" fontWeight="bold">
                      {currentWeather.天气}
                    </Text>
                  </HStack>
                  <HStack>
                    <FiThermometer size={20} />
                    <Text fontSize="3xl" fontWeight="bold" color="blue.500">
                      {currentWeather.温度}{currentWeather.温度单位 || "℃"}
                    </Text>
                  </HStack>
                </VStack>
              </Box>
              
              <Box>
                <VStack align="start" gap={2}>
                  <HStack>
                    <FiWind />
                    <Text>
                      <Text as="span" fontWeight="bold">风向：</Text>
                      {currentWeather.风向}
                    </Text>
                  </HStack>
                  <HStack>
                    <FiWind />
                    <Text>
                      <Text as="span" fontWeight="bold">风力：</Text>
                      {currentWeather.风力}级
                    </Text>
                  </HStack>
                  <HStack>
                    <FiDroplet />
                    <Text>
                      <Text as="span" fontWeight="bold">湿度：</Text>
                      {currentWeather.湿度}{currentWeather.湿度单位 || "%"}
                    </Text>
                  </HStack>
                </VStack>
              </Box>

              <Box>
                <VStack align="start">
                  <HStack>
                    <FiCalendar />
                    <Text fontSize="sm" color="gray.500">
                      更新时间
                    </Text>
                  </HStack>
                  <Text fontSize="sm">{currentWeather.报告时间}</Text>
                </VStack>
              </Box>
            </Grid>
          </Card.Body>
        </Card.Root>
      )}

      {/* 天气预报 */}
      {forecast && forecast.预报 && forecast.预报.length > 0 && (
        <Card.Root>
          <Card.Header>
            <Heading size="lg">{forecast.城市} - 天气预报</Heading>
          </Card.Header>
          <Card.Body>
            <Grid
              templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }}
              gap={4}
            >
              {forecast.预报.map((day, index) => (
                <Card.Root key={index} variant="outline">
                  <Card.Body>
                    <VStack align="stretch" gap={3}>
                      <Flex justify="space-between" align="center">
                        <Text fontWeight="bold">{day.日期}</Text>
                        <Badge colorPalette="blue">{day.星期}</Badge>
                      </Flex>
                      
                      <Box borderTopWidth="1px" pt={2}>
                        <Text fontSize="sm" color="gray.600" mb={1}>白天</Text>
                        <HStack justify="space-between">
                          <Text>{day.白天天气}</Text>
                          <Text color="orange.500" fontWeight="bold">
                            {day.白天温度}℃
                          </Text>
                        </HStack>
                        <Text fontSize="xs" color="gray.500">
                          {day.白天风向} {day.白天风力}级
                        </Text>
                      </Box>
                      
                      <Box borderTopWidth="1px" pt={2}>
                        <Text fontSize="sm" color="gray.600" mb={1}>夜间</Text>
                        <HStack justify="space-between">
                          <Text>{day.夜间天气}</Text>
                          <Text color="blue.500" fontWeight="bold">
                            {day.夜间温度}℃
                          </Text>
                        </HStack>
                        <Text fontSize="xs" color="gray.500">
                          {day.夜间风向} {day.夜间风力}级
                        </Text>
                      </Box>
                    </VStack>
                  </Card.Body>
                </Card.Root>
              ))}
            </Grid>
          </Card.Body>
        </Card.Root>
      )}
    </VStack>
  )
}

export default WeatherDisplay

