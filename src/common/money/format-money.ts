export function formatMoney(value: string): string {
  const [integer, decimals = ''] = value.split('.');

  return `${integer}.${decimals.padEnd(4, '0').slice(0, 4)}`;
}
