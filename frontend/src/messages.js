const TEXTS = {
  tooLong: {
    uk: 'Повідомлення занадто довге. Будь ласка, сформулюйте питання коротше.',
    en: 'The message is too long. Please rephrase your question more briefly.',
    pl: 'Wiadomość jest zbyt długa. Proszę sformułować pytanie krócej.',
  },
  noData: {
    uk: 'Вибачте, я не можу допомогти з цим питанням. У мене немає інформації про це.',
    en: "Sorry, I can't help with that. I don't have information about this.",
    pl: 'Przepraszam, nie mogę pomóc w tej sprawie. Nie mam informacji na ten temat.',
  },
  rateLimited: {
    uk: 'Забагато запитів. Будь ласка, спробуйте пізніше.',
    en: 'Too many requests. Please try again later.',
    pl: 'Zbyt wiele zapytań. Spróbuj ponownie później.',
  },
  failure: {
    uk: 'Щось пішло не так. Будь ласка, спробуйте пізніше.',
    en: 'Something went wrong. Please try again later.',
    pl: 'Coś poszło nie tak. Spróbuj ponownie później.',
  },
};

export const resolveLang = (lang) => (lang === 'uk' || lang === 'pl' ? lang : 'en');

export const text = (key, lang) => TEXTS[key][resolveLang(lang)];

export { TEXTS };
