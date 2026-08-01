export const defaultJsx = [
  "import { Counter } from './Counter.js'",
  '',
  'export const App = () => (',
  '  <main>',
  "    <Counter label='Clicks' />",
  '  </main>',
  ')',
  '',
].join('\n')

export const defaultModuleJsx = [
  "import '../styles/app.css'",
  '',
  'type CounterProps = {',
  '  label: string',
  '}',
  '',
  'export const Counter = ({ label }: CounterProps) => {',
  '  const el = (',
  "    <button class='counter-button' type='button'>",
  '      {label}: 0',
  '    </button>',
  '  ) as HTMLButtonElement',
  '  let count = 0',
  '',
  '  el.onclick = () => {',
  '    count += 1',
  '    el.textContent = `${label}: ${count}`',
  "    el.dataset.active = count % 2 === 0 ? 'false' : 'true'",
  "    el.classList.toggle('is-even', count % 2 === 0)",
  '  }',
  '',
  '  return el',
  '}',
  '',
].join('\n')

export const defaultReactJsx = [
  "import { useState } from 'react'",
  "import type { MouseEvent } from 'react'",
  '',
  'type CounterButtonProps = {',
  '  label: string',
  '  active: boolean',
  '  onClick: (event: MouseEvent<HTMLButtonElement>) => void',
  '}',
  '',
  'const CounterButton = ({ label, active, onClick }: CounterButtonProps) => (',
  '  <button',
  '    type="button"',
  '    data-active={active ? "true" : "false"}',
  '    className={active ? "counter-button is-even" : "counter-button"}',
  '    onClick={onClick}',
  '  >',
  '    {label}',
  '  </button>',
  ')',
  '',
  'const App = () => {',
  '  const [count, setCount] = useState(0)',
  '  const handleClick = (_event: MouseEvent<HTMLButtonElement>) => {',
  '    setCount(current => current + 1)',
  '  }',
  '',
  '  return (',
  '    <CounterButton',
  '      label={`React clicks: ${count}`}',
  '      active={count % 2 === 0}',
  '      onClick={handleClick}',
  '    />',
  '  )',
  '}',
  '',
].join('\n')

export const defaultCss = `.counter-button {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid #3558b8;
  border-radius: 0.5rem;
  background: #e9efff;
  color: #1a2a52;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.counter-button:hover {
  background: #dce6ff;
}

.counter-button[data-active='true'] {
  background: #3558b8;
  color: #fff;
}

.counter-button.is-even {
  border-style: dashed;
}

.counter-button:focus-visible {
  outline: 2px solid #6a84d8;
  outline-offset: 2px;
}
`
