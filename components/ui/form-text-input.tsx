import { TextInput, type TextInputProps } from "react-native";

const inputClassName =
  "min-h-12 rounded-xl border border-ink-muted bg-surface px-4 text-base text-ink";

type FormTextInputKind =
  | "text"
  | "email"
  | "password"
  | "multiline"
  | "number"
  | "phone";

export interface FormTextInputProps extends TextInputProps {
  kind?: FormTextInputKind;
}

export function FormTextInput({
  kind = "text",
  className,
  ...props
}: FormTextInputProps) {
  const mergedClassName = className
    ? `${inputClassName} ${className}`
    : inputClassName;

  if (kind === "email") {
    return (
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        className={mergedClassName}
        inputMode="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        {...props}
      />
    );
  }

  if (kind === "password") {
    return (
      <TextInput
        autoCapitalize="none"
        autoComplete={props.autoComplete ?? "password"}
        className={mergedClassName}
        secureTextEntry
        textContentType="password"
        {...props}
      />
    );
  }

  if (kind === "number") {
    return (
      <TextInput
        className={mergedClassName}
        inputMode="numeric"
        keyboardType="number-pad"
        {...props}
      />
    );
  }

  if (kind === "phone") {
    return (
      <TextInput
        autoCapitalize="none"
        className={mergedClassName}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        {...props}
      />
    );
  }

  if (kind === "multiline") {
    return (
      <TextInput
        className={`min-h-24 rounded-xl border border-ink-muted bg-surface px-4 py-3 text-base text-ink ${className ?? ""}`}
        multiline
        textAlignVertical="top"
        {...props}
      />
    );
  }

  return (
    <TextInput
      autoCapitalize="words"
      className={mergedClassName}
      {...props}
    />
  );
}
