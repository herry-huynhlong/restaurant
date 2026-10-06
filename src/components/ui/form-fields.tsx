export function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border bg-white px-3 outline-none focus:border-teal-600"
        name={name}
        defaultValue={defaultValue ?? options[0]?.[0]}
      >
        {options.map(([value, labelText]) => (
          <option key={value} value={value}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}
