"use client"

import * as React from "react"

const DropdownMenu = ({ children }: { children: React.ReactNode }) => <>{children}</>
const DropdownMenuTrigger = ({ children, asChild }: any) => <>{children}</>
const DropdownMenuContent = ({ children }: any) => <div>{children}</div>
const DropdownMenuItem = ({ children }: any) => <div>{children}</div>
const DropdownMenuLabel = ({ children }: any) => <div>{children}</div>
const DropdownMenuSeparator = () => <div className="my-1 h-px bg-border" />
const DropdownMenuGroup = ({ children }: any) => <>{children}</>
const DropdownMenuPortal = ({ children }: any) => <>{children}</>
const DropdownMenuSub = ({ children }: any) => <>{children}</>
const DropdownMenuSubContent = ({ children }: any) => <div>{children}</div>
const DropdownMenuSubTrigger = ({ children }: any) => <div>{children}</div>
const DropdownMenuRadioGroup = ({ children }: any) => <>{children}</>
const DropdownMenuRadioItem = ({ children }: any) => <div>{children}</div>
const DropdownMenuCheckboxItem = ({ children, checked }: any) => <div>{children}</div>
const DropdownMenuShortcut = ({ children }: any) => <span>{children}</span>

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
