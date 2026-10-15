/** Semantic palette shared by every chart and metric view. */
export const chartTheme = {
  actual: '#1769aa',
  baseline: '#64748b',
  incremental: '#0f9d91',
  forecast: '#8b5cf6',
  competitor: '#d97706',
  uncertainty: 'rgba(139, 92, 246, 0.14)',
  grid: '#e2e8f0',
  text: '#475569',
} as const;

export const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: { legend: { position: 'bottom' as const }, tooltip: { enabled: true } },
  scales: {
    x: { grid: { color: chartTheme.grid }, ticks: { color: chartTheme.text } },
    y: { beginAtZero: true, grid: { color: chartTheme.grid }, ticks: { color: chartTheme.text } },
  },
};
