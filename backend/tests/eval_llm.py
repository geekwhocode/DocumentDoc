import os
from deepeval.models.base_model import DeepEvalBaseLLM
from litellm import completion

class LiteLLMEvaluator(DeepEvalBaseLLM):
    def __init__(self, model_name="groq/llama-3.3-70b-versatile"):
        self.model_name = model_name

    def load_model(self):
        return self

    def generate(self, prompt: str) -> str:
        response = completion(
            model=self.model_name,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content

    async def a_generate(self, prompt: str) -> str:
        # DeepEval runs evaluations asynchronously, so having an async generate method is useful
        response = completion(
            model=self.model_name,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content

    def get_model_name(self) -> str:
        return self.model_name
