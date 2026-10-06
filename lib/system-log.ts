export type SystemLogLevel = 'info' | 'success' | 'warning' | 'error';
export type SystemLogCategory = 'system' | 'analysis' | 'connection' | 'image' | 'video' | 'qc';

export type SystemLogEntry = {
  id: string;
  time: string;
  level: SystemLogLevel;
  category: SystemLogCategory;
  action: string;
  detail?: string;
};

export const logCategoryLabels: Record<SystemLogCategory, string> = {
  system: '系统', analysis: '剧本分析', connection: '连接', image: '参考图', video: '视频', qc: '质检',
};

export const logLevelLabels: Record<SystemLogLevel, string> = {
  info: '信息', success: '成功', warning: '提醒', error: '错误',
};
