import { useContext, useRef, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Button,
} from "@/shared/ui";

type ExitProps = {
  pending: boolean;
  onSave: () => Promise<boolean>;
  onLeave: () => void;
  onCancel: () => void;
};

export function DraftExitDialog({ pending, onSave, onLeave, onCancel }: ExitProps) {
  const saving = useRef(false);
  const [failed, setFailed] = useState(false);
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <AlertDialogContent className="rounded-xl">
        <AlertDialogTitle>Сохранить изменения?</AlertDialogTitle>
        <AlertDialogDescription>
          Результат и заметка ещё не сохранены. Можно сохранить их, отказаться от изменений или
          продолжить редактирование.
        </AlertDialogDescription>
        <div className="flex flex-col gap-2">
          <Button
            disabled={pending}
            onClick={async () => {
              if (saving.current) return;
              saving.current = true;
              try {
                if (await onSave()) onLeave();
                else setFailed(true);
              } finally {
                saving.current = false;
              }
            }}
          >
            Сохранить и выйти
          </Button>
          <Button variant="outline" disabled={pending} onClick={onLeave}>
            Отказаться от изменений
          </Button>
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            Продолжить редактирование
          </Button>
        </div>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось сохранить. Проверьте введённое значение и соединение. Черновик сохранён;
            можно продолжить редактирование.
          </p>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

type GuardProps = Omit<ExitProps, "onLeave" | "onCancel"> & {
  dirty: boolean;
  explicitExit: { current: boolean };
};

function RouterDraftGuard(props: GuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      props.dirty &&
      !props.explicitExit.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  if (blocker.state !== "blocked") return null;
  return (
    <DraftExitDialog
      pending={props.pending}
      onSave={props.onSave}
      onLeave={() => blocker.proceed()}
      onCancel={() => blocker.reset()}
    />
  );
}

export function DraftNavigationGuard(props: GuardProps) {
  const router = useContext(UNSAFE_DataRouterContext);
  return router ? <RouterDraftGuard {...props} /> : null;
}
