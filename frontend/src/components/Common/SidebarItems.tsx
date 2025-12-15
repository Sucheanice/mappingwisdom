import { Box, Flex, Icon, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { Link as RouterLink } from "@tanstack/react-router"
import { useState } from "react"
import { FiBriefcase, FiHome, FiSettings, FiUsers, FiCloud, FiDatabase, FiMapPin, FiMap, FiAlertTriangle } from "react-icons/fi"
// import { FiShoppingBag } from "react-icons/fi" // 已注释：店铺位置功能暂时停用
import type { IconType } from "react-icons/lib"

import type { UserPublic } from "@/client"

interface Item {
  icon: IconType
  title: string
  path: string
}

interface MenuGroup {
  title: string
  icon: IconType
  items: Item[]
}

const menuGroups: MenuGroup[] = [
  {
    title: "天气与地图",
    icon: FiMap,
    items: [
      { icon: FiCloud, title: "天气查询", path: "/weather" },
      { icon: FiAlertTriangle, title: "安全提醒", path: "/safeAlertAgent" },
      { icon: FiMap, title: "Smart Map 3", path: "/smartMapThree" },
    ],
  },
  {
    title: "人员管理",
    icon: FiUsers,
    items: [
      { icon: FiDatabase, title: "用户管理", path: "/mysqlUsers" },
      { icon: FiMapPin, title: "位置上报", path: "/mysqlLocations" },
    ],
  },
]

const standaloneItems: Item[] = [
  { icon: FiHome, title: "主页", path: "/" },
  { icon: FiBriefcase, title: "任务管理", path: "/items" },
  { icon: FiSettings, title: "个人管理", path: "/settings" },
]

interface SidebarItemsProps {
  onClose?: () => void
  isCollapsed?: boolean
}

const SidebarItems = ({ onClose, isCollapsed = false }: SidebarItemsProps) => {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["天气与地图", "人员管理"]))

  const toggleGroup = (groupTitle: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupTitle)) {
        next.delete(groupTitle)
      } else {
        next.add(groupTitle)
      }
      return next
    })
  }

  const renderMenuItem = ({ icon, title, path }: Item, indent: number = 0) => (
    <RouterLink key={title} to={path} onClick={onClose}>
      <Flex
        gap={4}
        px={isCollapsed ? 2 : 4}
        py={2}
        pl={isCollapsed ? 2 : indent ? 8 : 4}
        _hover={{
          background: "gray.subtle",
        }}
        alignItems="center"
        justifyContent={isCollapsed ? "center" : "flex-start"}
        fontSize="sm"
        title={isCollapsed ? title : undefined}
      >
        <Icon as={icon} alignSelf="center" />
        {!isCollapsed && <Text ml={2}>{title}</Text>}
      </Flex>
    </RouterLink>
  )

  const renderMenuGroup = (group: MenuGroup) => {
    const isExpanded = expandedGroups.has(group.title)

    if (isCollapsed) {
      // 折叠状态下，只显示组内的菜单项，不显示组标题
      return (
        <Box key={group.title}>
          {group.items.map((item) => renderMenuItem(item))}
        </Box>
      )
    }

    return (
      <Box key={group.title}>
        <Flex
          gap={2}
          px={4}
          py={2}
          alignItems="center"
          cursor="pointer"
          onClick={() => toggleGroup(group.title)}
          _hover={{
            background: "gray.subtle",
          }}
          fontSize="sm"
          fontWeight="medium"
        >
          <Icon as={group.icon} alignSelf="center" />
          <Text ml={2} flex={1}>
            {group.title}
          </Text>
        </Flex>
        {isExpanded && (
          <Box>
            {group.items.map((item) => renderMenuItem(item, 1))}
          </Box>
        )}
      </Box>
    )
  }

  const finalStandaloneItems: Item[] = currentUser?.is_superuser
    ? [...standaloneItems, { icon: FiUsers, title: "Admin", path: "/admin" }]
    : standaloneItems

  return (
    <>
      {!isCollapsed && (
        <Text fontSize="xs" px={4} py={2} fontWeight="bold">
          菜单栏
        </Text>
      )}
      <Box>
        {/* 独立菜单项 */}
        {finalStandaloneItems.map((item) => renderMenuItem(item))}
        
        {/* 菜单组 */}
        {menuGroups.map((group) => renderMenuGroup(group))}
      </Box>
    </>
  )
}

export default SidebarItems
