import { Container } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"

import UserManagement from "@/components/MySQL/UserManagement"

export const Route = createFileRoute("/_layout/mysqlUsers")({
  component: MySQLUsers,
})

function MySQLUsers() {
  return (
    <Container maxW="full" py={8}>
      <UserManagement />
    </Container>
  )
}
