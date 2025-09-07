import type { ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'

// Custom render function that includes any providers your app needs
// This can be extended later with Zustand store providers, etc.

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'>

const customRender = (
  ui: ReactElement,
  options?: CustomRenderOptions
) => {
  // If you need to wrap components with providers (like Zustand store),
  // you can create an AllTheProviders wrapper here
  
  return render(ui, options)
}

// Re-export everything from testing-library/react
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'
export { customRender as render }