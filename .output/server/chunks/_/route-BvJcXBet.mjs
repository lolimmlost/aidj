import { jsx } from 'react/jsx-runtime';
import { Outlet } from '@tanstack/react-router';

function RouteComponent() {
  return /* @__PURE__ */ jsx("div", { className: "bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10", children: /* @__PURE__ */ jsx("div", { className: "w-full max-w-sm", children: /* @__PURE__ */ jsx(Outlet, {}) }) });
}

export { RouteComponent as component };
//# sourceMappingURL=route-BvJcXBet.mjs.map
