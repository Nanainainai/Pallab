import { useState, useEffect, useCallback } from 'react';

/*
 * FieldWrapper is private to this file on purpose: it exists only to give
 * HybridInput (and the sibling renderStandardInput helper below) their
 * label + hover-tooltip layout. It isn't meant to be imported or used on
 * its own anywhere else — everything that needs a labeled field should go
 * through HybridInput or renderStandardInput instead.
 */
function FieldWrapper({ label, options = [], className = "", children }) {
  const optionsTitle = options.length > 0 ? options.join('\n') : undefined;
  return (
    <div className={`flex flex-col w-full min-w-0 ${className}`}>
      {label && (
        <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none" title={optionsTitle}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

/*
 * The one HybridInput used everywhere: a labeled text input that also
 * offers a dropdown of suggestions.
 *
 * Options can be provided two ways (and may be mixed with either shape):
 *   - `options`: a synchronous array, each entry either a plain string or a
 *     `{ value, label }` object (label defaults to value when omitted).
 *   - `optionsFetcher`: a function returning an array/promise of options, or
 *     an array directly. Re-resolved whenever it changes (or on every
 *     render when passed as an inline arrow function, which keeps
 *     dependent fields such as Jamaat -> Reach fresh).
 *
 * The placeholder alternates between `placeholderInitial` and `defaultValue`
 * so an unfocused, empty field still hints at an example value. The field
 * always shows its own label (falling back to `placeholderInitial`) and a
 * "label: value" hover tooltip, matching the original letter-report
 * behavior that every consumer should now share.
 */
function HybridInput({
  name,
  options,
  optionsFetcher,
  placeholderInitial,
  defaultValue,
  value,
  onChange,
  label,
  wrapperClassName,
  ...props
}) {
  const [placeholder, setPlaceholder] = useState(placeholderInitial);
  const [isOpen, setIsOpen] = useState(false);
  const [resolvedOptions, setResolvedOptions] = useState(Array.isArray(options) ? options : []);

  const loadOptions = useCallback(async () => {
    if (typeof optionsFetcher === "function") {
      try {
        const resolved = await optionsFetcher();
        setResolvedOptions(Array.isArray(resolved) ? resolved.filter(Boolean) : []);
      } catch (error) {
        console.error(`Failed to load options for ${name}:`, error);
        setResolvedOptions([]);
      }
      return;
    }

    if (Array.isArray(optionsFetcher)) {
      setResolvedOptions(optionsFetcher.filter(Boolean));
      return;
    }

    setResolvedOptions(Array.isArray(options) ? options : []);
  }, [optionsFetcher, options, name]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    let timeout;
    const toggle = () => {
      setPlaceholder((previous) =>
        previous === placeholderInitial ? defaultValue : placeholderInitial
      );
      timeout = setTimeout(toggle, Math.random() * 3000 + 1000);
    };
    timeout = setTimeout(toggle, Math.random() * 3000 + 1000);
    return () => clearTimeout(timeout);
  }, [placeholderInitial, defaultValue]);

  const normalizedOptions = resolvedOptions.map((option) =>
    typeof option === "object" && option !== null
      ? { value: option.value, label: option.label ?? option.value }
      : { value: option, label: option }
  );

  const displayPlaceholder = label || placeholderInitial;
  const inputTitle = `${displayPlaceholder}: ${value || ''}`;

  return (
    <FieldWrapper
      label={displayPlaceholder}
      options={normalizedOptions.map((option) => option.label)}
      className={wrapperClassName}
    >
      <div className="relative w-full">
        <input
          className="w-full"
          {...props}
          name={name}
          value={value ?? ""}
          placeholder={placeholder}
          title={inputTitle}
          onChange={onChange}
          onFocus={(event) => {
            event.target.select();
            if (!props.readOnly && normalizedOptions.length) setIsOpen(true);
            props.onFocus?.(event);
          }}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        />
        {isOpen && normalizedOptions.length > 0 && (
          <ul className="top-full left-0 z-50 absolute bg-white dark:bg-black shadow-md mt-1 border border-gray-200 rounded-2xl max-h-40 overflow-y-auto font-bengali cursor-none pointer-events-none">
            {normalizedOptions.map((option) => (
              <li
                key={option.value}
                className="hover:bg-black dark:hover:bg-white p-2 hover:text-white dark:hover:text-black cursor-none pointer-events-auto"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange({ target: { name, value: option.value } });
                  setIsOpen(false);
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
}

/*
 * Renders a plain, labeled text input (no suggestion dropdown), sharing the
 * same private FieldWrapper as HybridInput above. Use this instead of
 * hand-rolling a label + <input> pair.
 */
export const renderStandardInput = (name, placeholder, value, onChange, props = {}) => {
  const { wrapperClassName, ...inputProps } = props;
  return (
    <FieldWrapper label={placeholder} className={wrapperClassName}>
      <input
        {...inputProps}
        name={name}
        value={value}
        placeholder={placeholder}
        title={`${placeholder}: ${value || ""}`}
        onChange={onChange}
        className={`w-full ${inputProps.className || ""}`}
      />
    </FieldWrapper>
  );
};

export default HybridInput;