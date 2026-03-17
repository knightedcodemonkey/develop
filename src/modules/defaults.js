export const defaultJsx = [
  'const Item = ({ value }) => <li>{value}</li>',
  'const List = ({ items, onClick }) => (',
  '  <ul onClick={onClick}>',
  '    {items.map(item => <Item key={item} value={item} />)}',
  '  </ul>',
  ')',
  'const Checkbox = ({ checked = false }) => <input type="checkbox" checked={checked} />',
  'const App = () => {',
  "  const items = ['apple', 'banana', 'orange']",
  '  const checkbox = <Checkbox checked={true} />',
  '  const onClickList = evt => {',
  '    if (evt.target.contains(checkbox)) {',
  '      checkbox.remove()',
  '    } else {',
  '      evt.target.appendChild(checkbox)',
  '    }',
  '  }',
  '',
  '  return <List items={items} onClick={onClickList} />',
  '}',
  '',
].join('\n')

export const defaultCss = `ul {
  --list-bg: linear-gradient(160deg, #d4dcec 0%, #c4cfe6 100%);
  --list-border: #a5b4d8;
  --item-bg: #b9bcc4;
  --item-hover: #c5c8cf;
  --item-text: #1f2a44;
  --item-accent: #3658c8;
  --check-ring: #6d86d1;

  margin: 0;
  padding: 14px;
  list-style: none;
  display: grid;
  gap: 10px;
  max-width: 340px;
  border-radius: 16px;
  border: 1px solid var(--list-border);
  background: var(--list-bg);
  box-shadow:
    0 14px 30px rgba(17, 27, 56, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(54, 88, 200, 0.24);
  background: var(--item-bg);
  color: var(--item-text);
  font-weight: 650;
  letter-spacing: 0.01em;
  cursor: pointer;
  user-select: none;
  transition:
    transform 130ms ease,
    background-color 130ms ease,
    border-color 130ms ease,
    box-shadow 130ms ease;
}

li:hover {
  transform: translateY(-1px);
  background: var(--item-hover);
  border-color: rgba(54, 88, 200, 0.34);
  box-shadow: 0 8px 18px rgba(24, 40, 95, 0.16);
}

input[type='checkbox'] {
  appearance: none;
  width: 18px;
  height: 18px;
  margin: 0;
  border-radius: 5px;
  border: 1.5px solid #4a63b6;
  background: #fff;
  display: inline-grid;
  place-items: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

input[type='checkbox']::after {
  content: '';
  width: 8px;
  height: 4px;
  border: 2px solid #fff;
  border-top: 0;
  border-right: 0;
  transform: rotate(-45deg) scale(0);
  transition: transform 120ms ease;
}

input[type='checkbox']:checked {
  background: linear-gradient(145deg, var(--item-accent), #345ee0);
  border-color: var(--item-accent);
}

input[type='checkbox']:checked::after {
  transform: rotate(-45deg) scale(1);
}

input[type='checkbox']:focus-visible {
  outline: 2px solid var(--check-ring);
  outline-offset: 2px;
}
`
