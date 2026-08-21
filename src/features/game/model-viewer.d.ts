import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        "camera-controls"?: boolean;
        "touch-action"?: string;
        exposure?: string;
        "shadow-intensity"?: string;
        "environment-image"?: string;
      };
    }
  }
}

export {};
