import {
  getSelectedText,
  Detail,
  getPreferenceValues,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Icon,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { global_model, enable_streaming, openai, using_azure } from "./api";
import { countToken, estimatePrice, sendToSideNote } from "./util";
import { Stream } from "openai/streaming";

export default function ResultView(props: {
  sys_prompt: string,
  selected_text?: string, // If defined, uses this as selected text
  user_extra_msg?: string, // If not empty, appends this to the user message
  model_override: string,
  toast_title: string,
}) {
  const { sys_prompt, selected_text, user_extra_msg, model_override, toast_title } = props;
  const pref = getPreferenceValues();
  const [response_token_count, setResponseTokenCount] = useState(0);
  const [prompt_token_count, setPromptTokenCount] = useState(0);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(true);
  const [cumulative_tokens, setCumulativeTokens] = useState(0);
  const [cumulative_cost, setCumulativeCost] = useState(0);
  const [model, setModel] = useState(model_override == "global" ? global_model : model_override);

  async function getResult() {
    const now = new Date();
    let duration = 0;
    const toast = await showToast(Toast.Style.Animated, toast_title);

    async function getChatResponse(prompt: string, selectedText: string) {
      try {
        const streamOrCompletion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: selectedText + (user_extra_msg ? `\n\n${user_extra_msg}` : '') },
          ],
          stream: enable_streaming,
        });
        setPromptTokenCount(countToken(prompt + selectedText));
        return streamOrCompletion;
      } catch (error) {
        toast.title = "Error";
        toast.style = Toast.Style.Failure;
        setLoading(false);
        const response_ =
          "⚠️ Failed to get response from OpenAI. Please check your network connection and API key.\n\n" +
          (using_azure ? `If using Azure, please make sure you've supplied the config as required by your deployment or try disabling response streaming.\n\n` : '') +
          `Error Message: \`\`\`${(error as Error).message}\`\`\``;
        setResponse(response_);
        return;
      }
    }

    let selectedText = selected_text;
    if (selectedText === undefined) {
      try {
        selectedText = await getSelectedText();
      } catch (error) {
        console.log(error);
        toast.title = "Error";
        toast.style = Toast.Style.Failure;
        setLoading(false);
        setResponse(
          "⚠️ Raycast was unable to get the selected text. You may try copying the text to a text editor and try again."
        );
        return;
      }
    }

    getChatResponse(sys_prompt, selectedText).then(async (resp) => {
      if (!resp) return;

      let response_ = "";
      function appendResponse(part: string) {
        response_ += part;
        setResponse(response_);
        setResponseTokenCount(countToken(response_));
      }

      if (resp instanceof Stream) {
        for await (const part of resp) {
          appendResponse(part.choices[0]?.delta?.content ?? "");
        }
      } else {
        appendResponse(resp.choices[0]?.message?.content ?? "");
      }

      setLoading(false);
      const done = new Date();
      duration = (done.getTime() - now.getTime()) / 1000;
      toast.style = Toast.Style.Success;
      toast.title = `Finished in ${duration} seconds`;
    });
  }

  async function retry() {
    setLoading(true);
    setResponse("");
    getResult();
  }

  async function retryWithGPT4() {
    setModel("gpt-4");
    setLoading(true);
    setResponse("");
    getResult();
  }

  useEffect(() => {
    getResult();
  }, []);

  useEffect(() => {
    if (loading == false) {
      setCumulativeTokens(cumulative_tokens + prompt_token_count + response_token_count);
      setCumulativeCost(cumulative_cost + estimatePrice(prompt_token_count, response_token_count, model));
    }
  }, [loading]);

  let sidenote = undefined;
  if (pref.sidenote) {
    sidenote = (
      <Action
        title="Send to SideNote"
        onAction={async () => {
          await sendToSideNote(response);
        }}
        shortcut={{ modifiers: ["cmd"], key: "s" }}
        icon={Icon.Sidebar}
      />
    );
  }

  return (
    <Detail
      markdown={response}
      isLoading={loading}
      actions={
        !loading && (
          <ActionPanel title="Actions">
            <Action.CopyToClipboard title="Copy Results" content={response} />
            <Action.Paste title="Paste Results" content={response} />
            <Action title="Retry" onAction={retry} shortcut={{ modifiers: ["cmd"], key: "r" }} icon={Icon.Repeat} />
            {model != "gpt-4" && (
              <Action
                title="Retry with GPT-4"
                onAction={retryWithGPT4}
                shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                icon={Icon.ArrowNe}
              />
            )}
            {sidenote}
          </ActionPanel>
        )
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Current Model" text={model} />
          <Detail.Metadata.Label title="Prompt Tokens" text={prompt_token_count.toString()} />
          <Detail.Metadata.Label title="Response Tokens" text={response_token_count.toString()} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Total Tokens" text={(prompt_token_count + response_token_count).toString()} />
          <Detail.Metadata.Label
            title="Total Cost"
            text={estimatePrice(prompt_token_count, response_token_count, model).toString() + " cents"}
          />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Culmulative Tokens" text={cumulative_tokens.toString()} />
          <Detail.Metadata.Label title="Culmulative Cost" text={cumulative_cost.toString() + " cents"} />
        </Detail.Metadata>
      }
    />
  );
}
