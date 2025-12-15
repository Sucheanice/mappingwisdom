import { Flex, Image, HStack, Text, useBreakpointValue } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

import UserMenu from "./UserMenu"
import Logo from "/assets/images/react-logo.svg"

function Navbar() {
  const display = useBreakpointValue({ base: "none", md: "flex" })

  return (
    <Flex
      display={display}
      justify="space-between"
      position="sticky"
      color="white"
      align="center"
      bg="bg.muted"
      w="100%"
      top={0}
      p={4}
    >
      <Link to="/">
        <HStack spacing={2} p={2} _hover={{ opacity: 0.8 }}>
          <Image src={Logo} alt="Logo" h={8} w="auto" />
          <Text fontSize="xl" fontWeight="bold" color="black">
            测智慧
          </Text>
        </HStack>
      </Link>
      <Flex gap={2} alignItems="center">
        <UserMenu />
      </Flex>
    </Flex>
  )
}

export default Navbar
