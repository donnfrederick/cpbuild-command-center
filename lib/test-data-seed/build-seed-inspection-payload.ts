import { randomUUID } from "crypto";
import type { FormQuestion, FormSection, FormTemplate } from "@/components/forms/formTypes";
import { AUTO_MEDIA_KEY, AUTO_NOTES_KEY } from "@/components/forms/formTypes";
import type { AnswerState } from "@/components/forms/FormFillClient";
import type { InspectionOutcome } from "@/lib/inspections/submissionsApi";
import { assertSubmissionAnswersComplete } from "@/lib/inspections/answer-completeness";
import { countDeficiencies } from "@/components/projects/inspections/inspectionSummary";
import { TEST_SEED_PREFIX } from "./constants";
import {
  pickSeedMediaFile,
  TEST_MEDIA_POOL,
  type SeedMediaContext,
} from "./media-pool";

function passLike(outcome: InspectionOutcome): boolean {
  return outcome === "PASS" || outcome === "COMPLETE";
}

function deterministicPick(seed: string): () => number {
  return () => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return (hash % 1000) / 1000;
  };
}

function testMediaFile(seed: string, media: SeedMediaContext): Record<string, unknown> {
  return pickSeedMediaFile(seed, media, deterministicPick(seed));
}

function buildDeficiency(
  question: FormQuestion,
  seed: string,
  media: SeedMediaContext
): Record<string, unknown> {
  const descriptionEnabled = question.deficiencyDescriptionEnabled ?? true;
  return {
    id: randomUUID(),
    description: descriptionEnabled
      ? `${TEST_SEED_PREFIX} Documented deficiency — ${question.title.slice(0, 80)}`
      : "",
    severity: "Minor",
    count: 1,
    capturedFiles: [testMediaFile(`${seed}-def-photo`, media)],
  };
}

function answerForQuestion(
  question: FormQuestion,
  pass: boolean,
  seed: string,
  media: SeedMediaContext
): Record<string, unknown> {
  switch (question.responseType) {
    case "PASS_FAIL": {
      const answer: Record<string, unknown> = { choice: pass ? "pass" : "fail" };
      if (question.photoRequired || !pass) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
    case "PASS_FAIL_DEFICIENCIES": {
      if (pass) {
        const answer: Record<string, unknown> = { choice: "pass" };
        if (question.photoRequired) {
          answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
        }
        return answer;
      }
      return {
        choice: "fail",
        deficiencies: [buildDeficiency(question, seed, media)],
        capturedFiles: [testMediaFile(`${seed}-photo`, media)],
      };
    }
    case "YES_NO": {
      const answer: Record<string, unknown> = { choice: pass ? "yes" : "no" };
      if (question.photoRequired || !pass) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
    case "MULTIPLE_CHOICE": {
      const option = question.options[0] ?? "Option A";
      const answer: Record<string, unknown> = { choice: option };
      if (question.photoRequired) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
    case "CHECKBOXES": {
      const option = question.options[0] ?? "Option A";
      const answer: Record<string, unknown> = { choices: [option] };
      if (question.photoRequired) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
    case "SHORT_ANSWER": {
      const answer: Record<string, unknown> = {
        text: pass
          ? `${TEST_SEED_PREFIX} Scope meets requirements.`
          : `${TEST_SEED_PREFIX} Deficiencies noted — corrective action required.`,
      };
      if (question.photoRequired || !pass) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
    case "PARAGRAPH": {
      const answer: Record<string, unknown> = {
        text: pass
          ? `${TEST_SEED_PREFIX} Installation completed to spec.`
          : `${TEST_SEED_PREFIX} Issues observed during walkthrough.`,
      };
      if (question.photoRequired || !pass) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
    case "NUMBER": {
      const titleLower = question.title.toLowerCase();
      let value: string;
      if (titleLower.includes("minute")) {
        value = pass ? "15" : "45";
      } else if (titleLower.includes("quant") || titleLower.includes("excess")) {
        value = pass ? "0" : "2";
      } else {
        value = pass ? "1" : "0";
      }
      const answer: Record<string, unknown> = { number: value };
      if (question.photoRequired || !pass) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
    case "RATING": {
      const answer: Record<string, unknown> = { rating: pass ? 4 : 2 };
      if (question.photoRequired || !pass) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
    default: {
      const answer: Record<string, unknown> = {
        text: `${TEST_SEED_PREFIX} ${seed}`,
      };
      if (question.photoRequired || !pass) {
        answer.capturedFiles = [testMediaFile(`${seed}-photo`, media)];
      }
      return answer;
    }
  }
}

function walkQuestions(
  sections: FormSection[],
  pass: boolean,
  seedPrefix: string,
  answers: Record<string, Record<string, unknown>>,
  questionIndex: { value: number },
  media: SeedMediaContext
): void {
  for (const section of sections) {
    for (const question of section.questions) {
      const seed = `${seedPrefix}-q${questionIndex.value++}`;
      const answer = answerForQuestion(question, pass, seed, media);
      answers[question.id] = answer;

      if (!pass && question.responseType === "PASS_FAIL" && question.failFollowUp) {
        const followUpKey = `${question.id}__followup`;
        answers[followUpKey] = answerForQuestion(
          question.failFollowUp,
          false,
          `${seed}-fu`,
          media
        );
      }
    }
  }
}

/**
 * Builds a complete inspection payload from a published form template.
 * Every required question is answered; fail outcomes include fully documented deficiencies.
 */
export function buildSeedInspectionPayload(
  template: FormTemplate,
  outcome: InspectionOutcome,
  seedPrefix: string,
  media: SeedMediaContext = { pool: TEST_MEDIA_POOL }
): { payload: Record<string, Record<string, unknown>>; deficiencyCount: number } {
  const pass = passLike(outcome);
  const answers: Record<string, Record<string, unknown>> = {};
  walkQuestions(template.sections, pass, seedPrefix, answers, { value: 0 }, media);

  if (!pass && media.pool.length > 0) {
    answers[AUTO_NOTES_KEY] = {
      text: `${TEST_SEED_PREFIX} Inspector walkthrough notes — deficiencies documented with field photos.`,
    };
    answers[AUTO_MEDIA_KEY] = {
      capturedFiles: [testMediaFile(`${seedPrefix}-inspector-media`, media)],
    };
  }

  assertSubmissionAnswersComplete(template, answers as Record<string, AnswerState>);

  const deficiencyCount = countDeficiencies(template, answers as never).total;

  return { payload: answers, deficiencyCount };
}
