# AI Development Rules for This Application

## Tech Stack (5‑10 bullet points)
- **React with TypeScript** – Core UI framework with static typing.
- **React Router** – All routes are defined in `src/App.tsx`.
- **Tailwind CSS** – Utility‑first styling for every component.
- **shadcn/ui** – Primary component library (buttons, dialogs, forms, etc.).
- **Radix UI primitives** – Underlying low‑level primitives used by shadcn/ui.
- **lucide-react** – Icon set for UI elements.
- **Vite (or CRA) build system** – Fast development server and bundling.
- **ESLint + Prettier** – Enforced code style and linting.
- **Jest / React Testing Library** – Unit testing (if tests are added).

## Rules for Library Usage
1. **Component Creation** – Use shadcn/ui components for all UI elements (e.g., `Button`, `Dialog`, `Input`, `Card`). Do not recreate these components from scratch.
2. **Styling** – Apply Tailwind CSS classes directly in JSX. Do not write custom CSS files unless absolutely necessary.
3. **Icons** – Import icons exclusively from `lucide-react`. Do not use external icon libraries.
4. **Routing** – Define every route in `src/App.tsx` using `react-router-dom`. Pages belong in `src/pages/`.
5. **State Management** – Use React's built‑in `useState`, `useReducer`, or Context API. Do not add external state libraries (e.g., Redux) unless a future requirement explicitly demands it.
6. **Data Fetching** – Use the native `fetch` API or `axios` if already present. Keep data‑fetching logic inside React components or custom hooks.
7. **Accessibility** – Prefer shadcn/ui components because they already include proper ARIA attributes. Add additional ARIA attributes only when needed.
8. **File Organization** – Components go in `src/components/`, pages in `src/pages/`. Keep the main entry page (`src/pages/Index.tsx`) updated to render new components.
9. **Testing** – Write tests using Jest and React Testing Library for any new logic or components. Keep test files alongside the component (`ComponentName.test.tsx`).
10. **Security** – Never interpolate user input directly into HTML or `dangerouslySetInnerHTML`. Validate and sanitize any data that reaches the DOM.

---
These rules ensure consistency, maintainability, and rapid development across the codebase.