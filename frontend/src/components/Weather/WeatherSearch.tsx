import {
  Button,
  Input,
  VStack,
  HStack,
  Text,
} from "@chakra-ui/react"
import { useState } from "react"
import { FiSearch } from "react-icons/fi"
import { Field } from "../ui/field"

interface WeatherSearchProps {
  onSearch: (city: string) => void
  isLoading?: boolean
}

const WeatherSearch = ({ onSearch, isLoading = false }: WeatherSearchProps) => {
  const [city, setCity] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (city.trim()) {
      onSearch(city.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <VStack align="stretch" gap={4}>
        <Field label="城市名称" helperText="请输入城市名称，如：北京、上海、成都等">
          <HStack>
            <Input
              placeholder="输入城市名称..."
              value={city}
              onChange={(e) => setCity(e.target.value)}
              size="lg"
            />
            <Button
              type="submit"
              colorPalette="blue"
              size="lg"
              loading={isLoading}
              disabled={!city.trim()}
            >
              <FiSearch />
              <Text ml={2}>搜索</Text>
            </Button>
          </HStack>
        </Field>
      </VStack>
    </form>
  )
}

export default WeatherSearch

