import { Card, Heading, Grid, Box, Text, VStack } from "@chakra-ui/react"

interface LocationData {
  地址?: string
  省?: string
  市?: string
  区县?: string
  乡镇?: string
}

interface LocationInfoProps {
  location?: LocationData
}

const InfoRow = ({ label, value }: { label: string; value?: string }) => {
  if (!value) return null
  return (
    <Box>
      <Text fontSize="sm" color="gray.600">
        {label}
      </Text>
      <Text fontWeight="medium">{value}</Text>
    </Box>
  )
}

const LocationInfo = ({ location }: LocationInfoProps) => {
  if (!location) return null

  return (
    <Card.Root>
      <Card.Header>
        <Heading size="lg">位置详情</Heading>
      </Card.Header>
      <Card.Body>
        <VStack align="stretch" gap={4}>
          {location.地址 && (
            <Box>
              <Text fontSize="sm" color="gray.600">
                地址
              </Text>
              <Text fontWeight="medium">{location.地址}</Text>
            </Box>
          )}
          <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={4}>
            <InfoRow label="省" value={location.省} />
            <InfoRow label="市" value={location.市} />
            <InfoRow label="区县" value={location.区县} />
          </Grid>
          <InfoRow label="乡镇" value={location.乡镇} />
        </VStack>
      </Card.Body>
    </Card.Root>
  )
}

export default LocationInfo


