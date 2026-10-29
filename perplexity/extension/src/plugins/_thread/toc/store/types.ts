export type TocItem = {
  id: number;
  /** Perplexity's row id, used to reach rows that are currently unmounted */
  uuid: string;
  title: string;
  element: JQuery<Element>;
  isActive?: boolean;
  isActiveTopMost?: boolean;
};

export type PanelPosition = {
  /** Viewport coordinates; the panel is `position: fixed` */
  position: { top: number; left: number; right: number };
  isOverflowing: boolean;
  width: number;
};
