export interface NaturalLanguageQuery {
    query: string;
    conversationId?: string;
    context?: QueryContext;
}
export interface QueryContext {
    previousQueries: string[];
    selectedTimeRange?: DateRange;
    selectedFilters?: Filter[];
}
export interface DateRange {
    startDate: string;
    endDate: string;
}
export interface Filter {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
    value: string | number | string[];
}
export interface QueryResult {
    queryId: string;
    sql: string;
    data: any[];
    columns: ColumnMetadata[];
    metadata: QueryMetadata;
    visualization?: VisualizationConfig;
    insights?: string[];
    executionTimeMs: number;
}
export interface ColumnMetadata {
    name: string;
    type: 'STRING' | 'INTEGER' | 'NUMERIC' | 'DATE' | 'TIMESTAMP' | 'BOOLEAN';
    description?: string;
    isEncrypted?: boolean;
}
export interface QueryMetadata {
    totalRows: number;
    truncated: boolean;
    cacheHit: boolean;
    costBytes: number;
}
export type ChartType = 'metric' | 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'stacked_bar' | 'grouped_bar' | 'funnel' | 'heatmap' | 'scatter' | 'combo' | 'table';
export interface VisualizationConfig {
    type: ChartType;
    title: string;
    description?: string;
    config: ChartConfig;
}
export interface ChartConfig {
    xAxis?: {
        field: string;
        label?: string;
        format?: string;
    };
    yAxis?: {
        field: string;
        label?: string;
        format?: 'number' | 'currency' | 'percentage';
        aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
    };
    yAxis2?: {
        field: string;
        label?: string;
        format?: 'number' | 'currency' | 'percentage';
    };
    series?: SeriesConfig[];
    colors?: string[];
    stacked?: boolean;
    showLegend?: boolean;
    showGrid?: boolean;
    showTooltip?: boolean;
    animate?: boolean;
}
export interface SeriesConfig {
    field: string;
    label: string;
    color?: string;
    type?: 'bar' | 'line' | 'area';
}
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    queryResult?: QueryResult;
    visualization?: VisualizationConfig;
    isStreaming?: boolean;
}
export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
}
export interface StreamingUpdate {
    type: 'thinking' | 'sql' | 'results' | 'visualization' | 'insights' | 'error' | 'complete';
    data: any;
}
export type ExportFormat = 'pdf' | 'ppt';
export interface ExportConfig {
    format: ExportFormat;
    title: string;
    subtitle?: string;
    includeDate: boolean;
    sections: ExportSection[];
    theme: ExportTheme;
    metadata: ExportMetadata;
}
export interface ExportSection {
    type: 'header' | 'text' | 'chart' | 'table' | 'insights';
    content: any;
    pageBreak?: boolean;
}
export interface ExportTheme {
    primaryColor: string;
    secondaryColor?: string;
    fontFamily: string;
    logo?: string;
    backgroundColor?: string;
}
export interface ExportMetadata {
    author: string;
    company: string;
    confidential: boolean;
    footer?: string;
}
export interface User {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'analyst' | 'viewer';
    company?: string;
    preferences?: UserPreferences;
    createdAt: string;
}
export interface UserPreferences {
    defaultDateRange: DateRange;
    defaultChartType: ChartType;
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
}
export interface AuthToken {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}
export interface TableSchema {
    name: string;
    description: string;
    columns: ColumnSchema[];
}
export interface ColumnSchema {
    name: string;
    type: string;
    description: string;
    isEncrypted: boolean;
    isQueryable: boolean;
    isNullable: boolean;
    foreignKey?: string;
    sampleValues?: string[];
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: ApiError;
    meta?: ResponseMeta;
}
export interface ApiError {
    code: string;
    message: string;
    details?: any;
}
export interface ResponseMeta {
    timestamp: string;
    requestId: string;
    pagination?: PaginationInfo;
}
export interface PaginationInfo {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
}
export interface ClientToServerEvents {
    'query:stream': (data: {
        query: string;
        conversationId?: string;
    }) => void;
    'query:cancel': (data: {
        queryId: string;
    }) => void;
    'chart:update': (data: {
        chartId: string;
        config: ChartConfig;
    }) => void;
}
export interface ServerToClientEvents {
    'query:thinking': (data: {
        queryId: string;
        message: string;
    }) => void;
    'query:sql': (data: {
        queryId: string;
        sql: string;
    }) => void;
    'query:results': (data: {
        queryId: string;
        data: any[];
        metadata: QueryMetadata;
    }) => void;
    'query:visualization': (data: {
        queryId: string;
        chartConfig: VisualizationConfig;
    }) => void;
    'query:insights': (data: {
        queryId: string;
        insights: string[];
    }) => void;
    'query:error': (data: {
        queryId: string;
        error: string;
    }) => void;
    'query:complete': (data: {
        queryId: string;
    }) => void;
}
//# sourceMappingURL=index.d.ts.map