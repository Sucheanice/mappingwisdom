import { Container } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"

import LocationManagement from "@/components/MySQL/LocationManagement"

export const Route = createFileRoute("/_layout/mysqlLocations")({
  component: MySQLLocations,
})

function MySQLLocations() {
  return (
    <Container maxW="full" py={8}>
      <LocationManagement />
    </Container>
  )
}
