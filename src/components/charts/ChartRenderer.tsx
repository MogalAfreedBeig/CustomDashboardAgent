// Chart Renderer - Renders different chart types based on configuration
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import type { SeriesConfig, VisualizationConfig } from '../../../shared/types';

interface ChartRendererProps {
  config: VisualizationConfig;
  data: any[];
}

const hasFieldValue = (data: any[], field?: string): boolean => {
  if (!field) return false;
  return data.some((row) => row?.[field] !== null && row?.[field] !== undefined);
};

export function isVisualizationRenderable(
  config?: VisualizationConfig,
  data: any[] = []
): boolean {
  if (!config || !data || data.length === 0) return false;

  const chartConfig = config.config;
  const xField = chartConfig.xAxis?.field;
  const yField = chartConfig.yAxis?.field;
  const hasX = hasFieldValue(data, xField);
  const hasY = hasFieldValue(data, yField);
  const hasSeries = (chartConfig.series || []).some((series) =>
    hasFieldValue(data, series.field)
  );

  switch (config.type) {
    case 'table':
      return false;
    case 'metric':
      return hasY;
    case 'line':
    case 'area':
    case 'combo':
      return data.length >= 2 && hasX && (hasY || hasSeries);
    case 'stacked_bar':
    case 'grouped_bar':
      return hasX && (hasY || hasSeries);
    case 'bar':
    case 'pie':
    case 'donut':
      return hasX && hasY;
    default:
      return hasX && hasY;
  }
}

export function ChartRenderer({ config, data }: ChartRendererProps) {
  if (!isVisualizationRenderable(config, data)) {
    return null;
  }

  const { type, title, config: chartConfig } = config;
  const colors = chartConfig.colors || [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
  ];

  const formatValue = (value: any, format?: string) => {
    const numericValue = typeof value === 'number' ? value : Number(value);
    const isNumeric = Number.isFinite(numericValue);

    if (format === 'currency' && isNumeric) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
      }).format(numericValue);
    }

    if (format === 'percentage' && isNumeric) {
      return `${(numericValue * 100).toFixed(2)}%`;
    }

    if (isNumeric) {
      return numericValue.toLocaleString('en-IN');
    }

    return value;
  };

  const renderEmptyState = (message: string) => (
    <div className='h-48 flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground'>
      {message}
    </div>
  );

  const buildSeries = (
    options: {
      includePrimary?: boolean;
      exclude?: string[];
      defaultType: 'bar' | 'line' | 'area';
    }
  ): SeriesConfig[] => {
    const includePrimary = options.includePrimary ?? true;
    const excluded = new Set(options.exclude || []);
    const yField = chartConfig.yAxis?.field;
    const yLabel = chartConfig.yAxis?.label;

    const baseSeries: SeriesConfig[] = includePrimary && yField
      ? [
        {
          field: yField,
          label: yLabel || yField,
          type: options.defaultType,
        },
      ]
      : [];

    const extraSeries = (chartConfig.series || [])
      .filter((series) => !excluded.has(series.field))
      .filter((series) => hasFieldValue(data, series.field));

    const merged = [...baseSeries, ...extraSeries];
    const seen = new Set<string>();
    return merged.filter((series) => {
      if (!series.field || seen.has(series.field)) return false;
      seen.add(series.field);
      return true;
    });
  };

  const renderMetric = () => {
    const value = data[0]?.[chartConfig.yAxis?.field || ''];
    const format = chartConfig.yAxis?.format;

    if (value === null || value === undefined) {
      return renderEmptyState('Metric value not found in query results.');
    }

    return (
      <div className='flex flex-col items-center justify-center h-48'>
        <p className='text-5xl font-bold text-primary'>
          {formatValue(value, format)}
        </p>
        <p className='text-muted-foreground mt-2'>
          {chartConfig.yAxis?.label || title}
        </p>
      </div>
    );
  };

  const renderLineChart = () => {
    const xField = chartConfig.xAxis?.field;
    const series = buildSeries({ defaultType: 'line' });

    if (!xField || series.length === 0) {
      return renderEmptyState('Line chart is missing x/y axis configuration.');
    }

    return (
      <ResponsiveContainer width='100%' height={300}>
        <LineChart data={data}>
          {chartConfig.showGrid && (
            <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
          )}
          <XAxis
            dataKey={xField}
            stroke='#6b7280'
            fontSize={12}
            tickFormatter={(value) => {
              if (typeof value === 'string' && value.length > 10) {
                return value.slice(0, 10) + '...';
              }
              return value;
            }}
          />
          <YAxis
            stroke='#6b7280'
            fontSize={12}
            tickFormatter={(value) =>
              formatValue(value, chartConfig.yAxis?.format)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value: number, name: string) => [
              formatValue(value, chartConfig.yAxis?.format),
              name,
            ]}
          />
          {chartConfig.showLegend && <Legend />}
          {series.map((seriesItem, index) => (
            <Line
              key={seriesItem.field}
              type='monotone'
              dataKey={seriesItem.field}
              stroke={seriesItem.color || colors[index % colors.length]}
              strokeWidth={2}
              dot={{ fill: seriesItem.color || colors[index % colors.length], strokeWidth: 2 }}
              name={seriesItem.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderBarChart = () => {
    const xField = chartConfig.xAxis?.field;
    const series = buildSeries({ defaultType: 'bar' });

    if (!xField || series.length === 0) {
      return renderEmptyState('Bar chart is missing x/y axis configuration.');
    }

    return (
      <ResponsiveContainer width='100%' height={300}>
        <BarChart data={data} layout='horizontal'>
          {chartConfig.showGrid && (
            <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
          )}
          <XAxis
            dataKey={xField}
            stroke='#6b7280'
            fontSize={12}
            tickFormatter={(value) => {
              if (typeof value === 'string' && value.length > 15) {
                return value.slice(0, 15) + '...';
              }
              return value;
            }}
          />
          <YAxis
            stroke='#6b7280'
            fontSize={12}
            tickFormatter={(value) =>
              formatValue(value, chartConfig.yAxis?.format)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value: number, name: string) => [
              formatValue(value, chartConfig.yAxis?.format),
              name,
            ]}
          />
          {chartConfig.showLegend && <Legend />}
          {series.map((seriesItem, index) => (
            <Bar
              key={seriesItem.field}
              dataKey={seriesItem.field}
              fill={seriesItem.color || colors[index % colors.length]}
              radius={series.length === 1 ? [4, 4, 0, 0] : undefined}
              name={seriesItem.label}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderAreaChart = () => {
    const xField = chartConfig.xAxis?.field;
    const series = buildSeries({ defaultType: 'area' });

    if (!xField || series.length === 0) {
      return renderEmptyState('Area chart is missing x/y axis configuration.');
    }

    return (
      <ResponsiveContainer width='100%' height={300}>
        <AreaChart data={data}>
          {chartConfig.showGrid && (
            <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
          )}
          <XAxis dataKey={xField} stroke='#6b7280' fontSize={12} />
          <YAxis
            stroke='#6b7280'
            fontSize={12}
            tickFormatter={(value) =>
              formatValue(value, chartConfig.yAxis?.format)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value: number, name: string) => [
              formatValue(value, chartConfig.yAxis?.format),
              name,
            ]}
          />
          {chartConfig.showLegend && <Legend />}
          {series.map((seriesItem, index) => (
            <Area
              key={seriesItem.field}
              type='monotone'
              dataKey={seriesItem.field}
              stroke={seriesItem.color || colors[index % colors.length]}
              fill={seriesItem.color || colors[index % colors.length]}
              fillOpacity={0.2 + (index === 0 ? 0.1 : 0)}
              name={seriesItem.label}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  const renderPieChart = () => {
    const xField = chartConfig.xAxis?.field;
    const yField = chartConfig.yAxis?.field;

    if (!xField || !yField) {
      return renderEmptyState('Pie chart is missing category/value configuration.');
    }

    const pieData = data.map((item) => ({
      name: item[xField],
      value:
        typeof item[yField] === "number"
          ? item[yField]
          : Number(String(item[yField]).replace(/,/g, "")),
    }));

    const isDonut = type === 'donut';

    return (
      <ResponsiveContainer width='100%' height={300}>
        <PieChart>
          <Pie
            data={pieData}
            cx='50%'
            cy='50%'
            innerRadius={isDonut ? 60 : 0}
            outerRadius={100}
            paddingAngle={5}
            dataKey='value'
          >
            {pieData.map((_entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) =>
              formatValue(value, chartConfig.yAxis?.format)
            }
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  const renderStackedBarChart = () => {
    const xField = chartConfig.xAxis?.field;
    const series = buildSeries({ defaultType: 'bar' });

    if (!xField || series.length === 0) {
      return renderEmptyState('Stacked bar chart requires x-axis and series fields.');
    }

    return (
      <ResponsiveContainer width='100%' height={300}>
        <BarChart data={data}>
          {chartConfig.showGrid && (
            <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
          )}
          <XAxis dataKey={xField} stroke='#6b7280' fontSize={12} />
          <YAxis stroke='#6b7280' fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
          />
          <Legend />
          {series.map((seriesItem, index) => (
            <Bar
              key={seriesItem.field}
              dataKey={seriesItem.field}
              stackId='a'
              fill={seriesItem.color || colors[index % colors.length]}
              name={seriesItem.label}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderGroupedBarChart = () => {
    const xField = chartConfig.xAxis?.field;
    const series = buildSeries({ defaultType: 'bar' });

    if (!xField || series.length === 0) {
      return renderEmptyState('Grouped bar chart requires x-axis and series fields.');
    }

    return (
      <ResponsiveContainer width='100%' height={300}>
        <BarChart data={data}>
          {chartConfig.showGrid && (
            <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
          )}
          <XAxis dataKey={xField} stroke='#6b7280' fontSize={12} />
          <YAxis stroke='#6b7280' fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
          />
          <Legend />
          {series.map((seriesItem, index) => (
            <Bar
              key={seriesItem.field}
              dataKey={seriesItem.field}
              fill={seriesItem.color || colors[index % colors.length]}
              name={seriesItem.label}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderComboChart = () => {
    const xField = chartConfig.xAxis?.field;
    const yField = chartConfig.yAxis?.field;
    const y2Field = chartConfig.yAxis2?.field;
    const additionalSeries = buildSeries({
      includePrimary: false,
      exclude: [yField || '', y2Field || ''],
      defaultType: 'line',
    });

    if (!xField || !yField) {
      return renderEmptyState('Combo chart is missing axis configuration.');
    }

    return (
      <ResponsiveContainer width='100%' height={300}>
        <ComposedChart data={data}>
          {chartConfig.showGrid && (
            <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
          )}
          <XAxis dataKey={xField} stroke='#6b7280' fontSize={12} />
          <YAxis
            yAxisId='left'
            stroke='#6b7280'
            fontSize={12}
            tickFormatter={(value) =>
              formatValue(value, chartConfig.yAxis?.format)
            }
          />
          {y2Field && (
            <YAxis
              yAxisId='right'
              orientation='right'
              stroke='#6b7280'
              fontSize={12}
              tickFormatter={(value) =>
                formatValue(value, chartConfig.yAxis2?.format)
              }
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
          />
          {chartConfig.showLegend && <Legend />}
          <Bar
            yAxisId='left'
            dataKey={yField}
            fill={colors[0]}
            name={chartConfig.yAxis?.label || yField}
          />
          {additionalSeries.map((seriesItem, index) => {
            const color = seriesItem.color || colors[(index + 1) % colors.length];
            if (seriesItem.type === 'bar') {
              return (
                <Bar
                  key={seriesItem.field}
                  yAxisId='left'
                  dataKey={seriesItem.field}
                  fill={color}
                  name={seriesItem.label}
                />
              );
            }
            if (seriesItem.type === 'area') {
              return (
                <Area
                  key={seriesItem.field}
                  yAxisId='left'
                  type='monotone'
                  dataKey={seriesItem.field}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                  name={seriesItem.label}
                />
              );
            }
            return (
              <Line
                key={seriesItem.field}
                yAxisId='left'
                type='monotone'
                dataKey={seriesItem.field}
                stroke={color}
                strokeWidth={2}
                name={seriesItem.label}
              />
            );
          })}
          {y2Field && (
            <Line
              yAxisId='right'
              type='monotone'
              dataKey={y2Field}
              stroke={colors[1]}
              strokeWidth={2}
              name={chartConfig.yAxis2?.label || y2Field}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  const renderChart = () => {
    switch (type) {
      case 'metric':
        return renderMetric();
      case 'line':
        return renderLineChart();
      case 'bar':
        return renderBarChart();
      case 'area':
        return renderAreaChart();
      case 'pie':
      case 'donut':
        return renderPieChart();
      case 'stacked_bar':
        return renderStackedBarChart();
      case 'grouped_bar':
        return renderGroupedBarChart();
      case 'combo':
        return renderComboChart();
      default:
        return renderBarChart();
    }
  };

  return (
    <div className='space-y-4'>
      <h3 className='text-lg font-semibold'>{title}</h3>
      {renderChart()}
    </div>
  );
}
