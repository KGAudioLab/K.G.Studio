// selectable interface
export interface Selectable {
  getId(): string;
  select(): void;
  deselect(): void;
  isSelected(): boolean;
  getRootType(): string;
  getCurrentType(): string;
}

// Define a Region interface for UI representation
export interface RegionUI {
  id: string;
  trackId: string;
  trackIndex: number;
  barNumber: number;
  length: number;
  name: string;
}

// Define resize action types
export type ResizeAction = 'none' | 'start' | 'end';

// Define region resize state
export interface RegionResizeState {
  regionId: string;
  isResizing: boolean;
  resizeAction: ResizeAction;
  initialX: number;
  initialBarNumber: number;
  initialLength: number;
}

// Define region drag state
export interface RegionDragState {
  regionId: string;
  isDragging: boolean;
  initialX: number;
  initialY: number;
  initialBarNumber: number;
  initialTrackIndex: number;
} 