import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        "camera-controls"?: boolean;
        "disable-pan"?: boolean;
        "disable-zoom"?: boolean;
        "touch-action"?: string;
        "camera-orbit"?: string;
        "camera-target"?: string;
        "field-of-view"?: string;
        exposure?: string;
        "shadow-intensity"?: string;
        "environment-image"?: string;
      };
    }
  }
}

export {};
