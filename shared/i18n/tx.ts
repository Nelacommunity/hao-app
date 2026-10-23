/**
 * Marks English text that is shown to users but defined outside a component (lists, data). It returns the
 * text unchanged; `npm run i18n:build` collects it for translation, and screens show it with `t(value)`.
 */
export const tx = <S extends string>(text: S): S => text;
