// Escala central de z-index — evita que componentes escolham valores
// mágicos de forma independente e acabem colidindo (ex: Tooltip, ToastHost
// e TaskModeSelector usavam todos 1000 antes desta escala existir).
export const Z = {
  dropdown: 50, // TaskSuggestions — lista de sugestões inline
  accountMenu: 60, // MainWindow — dropdown de conta
  contextMenu: 200, // ContextMenu — menu de clique direito
  panel: 300, // TaskCenter — overlay interno da página
  popover: 900, // ProjectPicker, TaskModeSelector — overlays de tela cheia
  toast: 1000, // ToastHost — notificações
  tooltip: 1100, // Tooltip — sempre por cima de tudo
} as const;
