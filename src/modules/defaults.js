export const defaultJsx = [
  'type CounterButtonProps = {',
  '  label: string',
  '  onClick: (event: MouseEvent) => void',
  '}',
  '',
  'const CounterButton = ({ label, onClick }: CounterButtonProps) => (',
  '  <button class="counter-button" type="button" onClick={onClick}>',
  '    {label}',
  '  </button>',
  ')',
  '',
  'const App = () => {',
  '  let count = 0',
  '  const handleClick = (event: MouseEvent) => {',
  '    count += 1',
  '    const button = event.currentTarget as HTMLButtonElement',
  '    button.textContent = `Clicks: ${count}`',
  "    button.dataset.active = count % 2 === 0 ? 'false' : 'true'",
  "    button.classList.toggle('is-even', count % 2 === 0)",
  '  }',
  '',
  "  return <CounterButton label='Clicks: 0' onClick={handleClick} />",
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
