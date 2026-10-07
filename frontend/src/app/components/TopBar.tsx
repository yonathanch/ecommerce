import { MapPin, PackageSearch, Info } from 'lucide-react'

export function TopBar() {
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-[1200px] mx-auto px-4 h-9 flex items-center justify-between text-xs text-gray-500">
        <span className="font-medium text-gray-500">Welcome to worldwide Megamart!</span>
        <div className="flex items-center gap-5">
          <a href="#" className="flex items-center gap-1.5 hover:text-blue-600 transition">
            <MapPin className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-gray-600">Deliver to <span className="font-semibold text-gray-800">423651</span></span>
          </a>
          <a href="#" className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600 transition">
            <PackageSearch className="w-3.5 h-3.5 text-blue-500" />
            Track your order
          </a>
          <a href="#" className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600 transition">
            <Info className="w-3.5 h-3.5 text-blue-500" />
            All Offers
          </a>
        </div>
      </div>
    </div>
  )
}
