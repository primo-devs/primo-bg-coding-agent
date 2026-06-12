"""
Unit tests for inbound attachment handling in the bridge.

Covers _build_attachment_parts (mapping inbound attachments to OpenCode file
parts) and _build_prompt_request_body (appending those parts after the text
part).
"""

from sandbox_runtime.bridge import AgentBridge


def make_bridge() -> AgentBridge:
    return AgentBridge(
        sandbox_id="test-sandbox",
        session_id="test-session",
        control_plane_url="http://localhost:8787",
        auth_token="test-token",
    )


def test_build_attachment_parts_maps_data_url_image():
    parts = AgentBridge._build_attachment_parts(
        [
            {
                "type": "image",
                "name": "photo.jpg",
                "mimeType": "image/jpeg",
                "url": "data:image/jpeg;base64,AAAA",
            }
        ]
    )
    assert parts == [
        {
            "type": "file",
            "url": "data:image/jpeg;base64,AAAA",
            "mime": "image/jpeg",
            "filename": "photo.jpg",
        }
    ]


def test_build_attachment_parts_infers_mime_from_data_url():
    parts = AgentBridge._build_attachment_parts(
        [{"type": "image", "name": "x.png", "url": "data:image/png;base64,BBBB"}]
    )
    assert parts[0]["mime"] == "image/png"


def test_build_attachment_parts_falls_back_to_content_field():
    parts = AgentBridge._build_attachment_parts(
        [{"type": "image", "name": "y", "content": "data:image/webp;base64,CCCC"}]
    )
    assert parts[0]["url"] == "data:image/webp;base64,CCCC"
    assert parts[0]["mime"] == "image/webp"


def test_build_attachment_parts_skips_entries_without_url():
    parts = AgentBridge._build_attachment_parts(
        [{"type": "image", "name": "no-data"}, {"type": "file", "name": "also-empty"}]
    )
    assert parts == []


def test_build_attachment_parts_handles_none():
    assert AgentBridge._build_attachment_parts(None) == []


def test_build_prompt_request_body_appends_attachment_parts_after_text():
    bridge = make_bridge()
    body = bridge._build_prompt_request_body(
        content="look at this",
        model=None,
        attachments=[{"type": "image", "name": "p.jpg", "url": "data:image/jpeg;base64,AAAA"}],
    )
    assert body["parts"][0] == {"type": "text", "text": "look at this"}
    assert body["parts"][1]["type"] == "file"
    assert body["parts"][1]["url"] == "data:image/jpeg;base64,AAAA"


def test_build_prompt_request_body_without_attachments_is_text_only():
    bridge = make_bridge()
    body = bridge._build_prompt_request_body(content="hi", model=None)
    assert body["parts"] == [{"type": "text", "text": "hi"}]
