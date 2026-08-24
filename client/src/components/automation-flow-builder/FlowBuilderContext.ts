import { createContext, useContext } from "react";

interface FlowBuilderContextType {
  openNodePicker: (
    sourceNodeId: string,
    sourceHandle: string | null,
    position: { x: number; y: number }
  ) => void;
}

export const FlowBuilderContext = createContext<FlowBuilderContextType | null>(null);
export const useFlowBuilder = () => useContext(FlowBuilderContext);
