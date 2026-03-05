import { Combobox, ComboboxOption } from "@/components/ui/combobox";

interface Product {
  id: number | string;
  sku: string;
  description: string;
}

interface ProductComboboxProps {
  products: Product[] | undefined;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ProductCombobox({
  products,
  value,
  onValueChange,
  placeholder = "Selecione um produto",
  disabled = false,
  className,
}: ProductComboboxProps) {
  const options: ComboboxOption[] = (products || []).map((product) => ({
    value: String(product.id), // Converter para string para o Combobox
    label: `${product.sku} - ${product.description}`,
    searchTerms: `${product.sku} ${product.description}`.toLowerCase(),
  }));

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      emptyText="Nenhum produto encontrado"
      searchPlaceholder="Buscar por SKU ou descrição..."
      disabled={disabled}
      className={className}
    />
  );
}
