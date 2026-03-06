// Dashboard Component - Analytics dashboard view
import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  MousePointer,
  Eye,
  Calendar,
  Filter,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// Mock data for dashboard
const performanceData = [
  {
    date: 'Jan 1',
    spend: 4500,
    revenue: 12000,
    impressions: 125000,
    clicks: 3200,
  },
  {
    date: 'Jan 2',
    spend: 5200,
    revenue: 15000,
    impressions: 140000,
    clicks: 3800,
  },
  {
    date: 'Jan 3',
    spend: 4800,
    revenue: 13500,
    impressions: 130000,
    clicks: 3500,
  },
  {
    date: 'Jan 4',
    spend: 6100,
    revenue: 18000,
    impressions: 165000,
    clicks: 4200,
  },
  {
    date: 'Jan 5',
    spend: 5500,
    revenue: 16200,
    impressions: 150000,
    clicks: 3900,
  },
  {
    date: 'Jan 6',
    spend: 6700,
    revenue: 21000,
    impressions: 180000,
    clicks: 4800,
  },
  {
    date: 'Jan 7',
    spend: 7200,
    revenue: 22500,
    impressions: 195000,
    clicks: 5100,
  },
];

const channelData = [
  { name: 'Search', value: 45, color: '#3B82F6' },
  { name: 'Social', value: 30, color: '#10B981' },
  { name: 'Display', value: 15, color: '#F59E0B' },
  { name: 'Video', value: 10, color: '#EF4444' },
];

const topCampaigns = [
  { name: 'Summer Sale 2024', spend: 45000, revenue: 135000, roas: 3.0 },
  { name: 'Brand Awareness Q4', spend: 32000, revenue: 85000, roas: 2.66 },
  { name: 'Product Launch', spend: 28000, revenue: 98000, roas: 3.5 },
  { name: 'Holiday Special', spend: 55000, revenue: 165000, roas: 3.0 },
  { name: 'Retargeting', spend: 15000, revenue: 52000, roas: 3.47 },
];

export function Dashboard() {
  const [dateRange, setDateRange] = useState('7d');

  const metrics = [
    {
      title: 'Total Spend',
      value: '$40,000',
      change: '+12.5%',
      trend: 'up',
      icon: DollarSign,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Revenue',
      value: '$116,700',
      change: '+18.2%',
      trend: 'up',
      icon: TrendingUp,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'ROAS',
      value: '2.92x',
      change: '+5.1%',
      trend: 'up',
      icon: TrendingUp,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Impressions',
      value: '1.08M',
      change: '-2.3%',
      trend: 'down',
      icon: Eye,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      title: 'Clicks',
      value: '28,500',
      change: '+8.7%',
      trend: 'up',
      icon: MousePointer,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
    },
    {
      title: 'CTR',
      value: '2.64%',
      change: '+11.2%',
      trend: 'up',
      icon: Users,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
    },
  ];

  return (
    <div className='h-screen overflow-auto bg-background'>
      {/* Header */}
      <header className='sticky top-0 z-10 h-16 border-b border-border flex items-center justify-between px-6 bg-card'>
        <div>
          <h2 className='font-semibold'>Analytics Dashboard</h2>
          <p className='text-xs text-muted-foreground'>
            Real-time campaign performance overview
          </p>
        </div>

        <div className='flex items-center gap-3'>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className='w-[140px]'>
              <Calendar size={16} className='mr-2' />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='24h'>Last 24 hours</SelectItem>
              <SelectItem value='7d'>Last 7 days</SelectItem>
              <SelectItem value='30d'>Last 30 days</SelectItem>
              <SelectItem value='90d'>Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          <Button variant='outline' size='icon'>
            <Filter size={18} />
          </Button>
        </div>
      </header>

      <div className='p-6 space-y-6'>
        {/* Metrics Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4'>
          {metrics.map((metric) => (
            <Card key={metric.title}>
              <CardContent className='p-4'>
                <div className='flex items-center justify-between'>
                  <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                    <metric.icon size={20} className={metric.color} />
                  </div>
                  <div
                    className={`flex items-center gap-1 text-xs ${
                      metric.trend === 'up' ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {metric.trend === 'up' ? (
                      <TrendingUp size={14} />
                    ) : (
                      <TrendingDown size={14} />
                    )}
                    {metric.change}
                  </div>
                </div>
                <div className='mt-3'>
                  <p className='text-2xl font-bold'>{metric.value}</p>
                  <p className='text-xs text-muted-foreground'>
                    {metric.title}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Performance Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Trend</CardTitle>
              <CardDescription>Spend vs Revenue over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={300}>
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
                  <XAxis dataKey='date' stroke='#6b7280' fontSize={12} />
                  <YAxis stroke='#6b7280' fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type='monotone'
                    dataKey='spend'
                    stroke='#3B82F6'
                    strokeWidth={2}
                    name='Spend'
                  />
                  <Line
                    type='monotone'
                    dataKey='revenue'
                    stroke='#10B981'
                    strokeWidth={2}
                    name='Revenue'
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Channel Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Channel Distribution</CardTitle>
              <CardDescription>Spend by channel</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={300}>
                <PieChart>
                  <Pie
                    data={channelData}
                    cx='50%'
                    cy='50%'
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey='value'
                  >
                    {channelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className='flex justify-center gap-4 mt-4'>
                {channelData.map((channel) => (
                  <div key={channel.name} className='flex items-center gap-2'>
                    <div
                      className='w-3 h-3 rounded-full'
                      style={{ backgroundColor: channel.color }}
                    />
                    <span className='text-sm text-muted-foreground'>
                      {channel.name} ({channel.value}%)
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Campaigns</CardTitle>
            <CardDescription>Ranked by ROAS</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={250}>
              <BarChart data={topCampaigns} layout='vertical'>
                <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
                <XAxis type='number' stroke='#6b7280' fontSize={12} />
                <YAxis
                  dataKey='name'
                  type='category'
                  stroke='#6b7280'
                  fontSize={11}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'roas') return [`${value}x`, 'ROAS'];
                    if (name === 'spend')
                      return [`$${value.toLocaleString()}`, 'Spend'];
                    if (name === 'revenue')
                      return [`$${value.toLocaleString()}`, 'Revenue'];
                    return [value, name];
                  }}
                />
                <Bar
                  dataKey='roas'
                  fill='#3B82F6'
                  radius={[0, 4, 4, 0]}
                  name='roas'
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common analytics tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex flex-wrap gap-3'>
              {[
                'Compare campaign performance',
                'Analyze channel effectiveness',
                'View conversion funnel',
                'Check budget utilization',
                'Export monthly report',
              ].map((action) => (
                <Button key={action} variant='outline' size='sm'>
                  {action}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
