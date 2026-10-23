import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowUpRight,
  Bot,
  ChevronRight,
  Globe,
  PanelsTopLeft,
  Send,
  Sparkles,
  X,
} from "lucide-react";

const services = [
  { icon: Globe, title: "Сайты", description: "Лендинги, сайты компаний и страницы услуг." },
  {
    icon: PanelsTopLeft,
    title: "Веб-приложения",
    description: "Личные кабинеты, внутренние инструменты и сервисы.",
  },
  { icon: Bot, title: "Telegram-боты", description: "Заявки, уведомления и автоматизация." },
];

export function DeveloperCard() {
  return (
    <Dialog.Root>
      <section aria-label="Услуги разработчика" className="rounded-lg bg-primary-soft p-3">
        <p className="text-[11px]/[1.4] font-medium text-muted-foreground">Денис · разработчик</p>
        <h2 className="mt-2 text-[15px]/[1.4] font-semibold tracking-tight">
          Нужен сайт или свой сервис?
        </h2>
        <p className="mt-2 text-sm/[1.4] text-muted-foreground md:text-xs/[1.4]">
          <span className="md:hidden">
            Сайты, веб-приложения и Telegram-боты. ИИ под ваши задачи.
          </span>
          <span className="hidden md:inline">Сайты и веб-приложения. Telegram-боты и ИИ.</span>
        </p>
        <Dialog.Trigger className="mt-2 flex min-h-11 w-full items-center gap-1 rounded text-left text-sm font-semibold tracking-tight whitespace-nowrap text-primary outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-primary md:min-h-[34px] md:text-xs">
          Обсудить проект <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
        </Dialog.Trigger>
      </section>
      <Dialog.Portal>
        <Dialog.Backdrop
          forceRender
          className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"
        />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex max-h-[100dvh] flex-col gap-5 overflow-y-auto rounded-t-[16px] border bg-card px-5 pt-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] text-card-foreground outline-none transition duration-150 data-ending-style:translate-y-4 data-ending-style:opacity-0 data-starting-style:translate-y-4 data-starting-style:opacity-0 motion-reduce:transition-none md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[calc(100dvh-3rem)] md:w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[16px] md:p-7 md:data-ending-style:translate-y-[calc(-50%+0.5rem)] md:data-starting-style:translate-y-[calc(-50%+0.5rem)]">
          <header className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[22px]/[1.5] font-semibold md:text-2xl/[1.5]">
                Привет, я Денис
              </Dialog.Title>
              <p className="mt-1 text-xs/[1.5] font-medium text-primary">
                Разработчик и автор Ритма
              </p>
            </div>
            <Dialog.Close
              aria-label="Закрыть окно об авторе"
              className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary md:size-8"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </header>
          <Dialog.Description className="text-sm/[1.5] text-muted-foreground">
            Разрабатываю сайты, веб-приложения и Telegram-ботов. Внедряю ИИ под ваши задачи.
          </Dialog.Description>
          <section aria-labelledby="developer-services-title" className="flex flex-col gap-3.5">
            <h3 id="developer-services-title" className="text-[13px]/[1.5] font-semibold">
              Чем могу помочь
            </h3>
            {services.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <h4 className="text-sm/[1.5] font-semibold">{title}</h4>
                  <p className="mt-1 text-[13px]/[1.5] text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3 rounded-lg bg-primary-soft p-3.5">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <h4 className="text-sm/[1.5] font-semibold text-primary">ИИ и ChatGPT</h4>
                <p className="mt-1 text-[13px]/[1.5] text-foreground">
                  Ассистенты, работа с документами и подключение ваших данных.
                </p>
              </div>
            </div>
          </section>
          <div className="rounded-lg bg-muted px-3.5 py-3 text-[13px]/[1.5]">
            <p className="font-semibold">Ритм — пример моей работы</p>
            <p className="mt-1 text-muted-foreground">
              Планирование, учёт целей и Telegram-уведомления.
            </p>
          </div>
          <footer className="flex flex-col gap-2.5">
            <a
              href="https://t.me/ChernykDenis"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-3 text-center text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Send className="size-[18px] shrink-0" aria-hidden="true" />
              Обсудить проект в Telegram
              <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
            </a>
            <p className="text-center text-xs/[1.5] text-muted-foreground">
              Личный Telegram · @ChernykDenis
            </p>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
