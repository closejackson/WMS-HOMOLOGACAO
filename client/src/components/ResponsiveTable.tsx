import React from "react";

interface ResponsiveTableProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Componente wrapper para tabelas responsivas
 * Em mobile: adiciona scroll horizontal
 * Em desktop: exibe tabela normalmente
 */
export function ResponsiveTable({ children, className = "" }: ResponsiveTableProps) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <div className="min-w-[640px]">
        {children}
      </div>
    </div>
  );
}

/**
 * Componente de card alternativo para exibir dados em mobile
 * Substitui tabelas quando há muitas colunas
 */
interface DataCardProps {
  title: string;
  subtitle?: string;
  fields: Array<{
    label: string;
    value: React.ReactNode;
    className?: string;
  }>;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function DataCard({ title, subtitle, fields, actions, onClick, className = "" }: DataCardProps) {
  return (
    <div 
      className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          {subtitle && (
            <p className="text-sm text-gray-500 truncate">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex-shrink-0 ml-2">
            {actions}
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div key={idx} className="flex justify-between items-center text-sm">
            <span className="text-gray-600">{field.label}:</span>
            <span className={`font-medium ${field.className || 'text-gray-900'}`}>
              {field.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
