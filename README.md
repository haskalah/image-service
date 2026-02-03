# Image Service

A NestJS-based image management API with API key authentication and local file storage.

## Setup

### Prerequisites
- Node.js 18+
- MongoDB instance

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
MONGODB_URI=mongodb://localhost:27017/imageservice
IMAGE_DIR=./uploads
PORT=3120
```

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | Required |
| `IMAGE_DIR` | Directory for storing uploaded images | `./uploads` |
| `PORT` | Server port | `3120` |

### Running the Service

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Key Management

API keys are managed via CLI scripts (not HTTP endpoints for security).

### Create an API Key

```bash
npm run key:create -- <appName> [permissions...]
```

**Permissions:**
- `read` - Can retrieve images and metadata
- `write` - Can upload and update images
- `delete` - Can delete images
- `admin` - Full access

**Examples:**
```bash
# Create a key with read and write permissions
npm run key:create -- myapp read write

# Create an admin key
npm run key:create -- admin-tool admin
```

The script outputs the raw API key. **Store it securely** - it cannot be retrieved later (only the hash is stored).

### List API Keys

```bash
npm run key:list
```

Shows all API keys with their ID, app name, permissions, and status.

### Update API Key Permissions

```bash
npm run key:update -- <apiKeyID> <permissions...>
```

**Example:**
```bash
npm run key:update -- 1 read write delete
```

### Revoke an API Key

```bash
npm run key:revoke -- <apiKeyID>
```

## API Endpoints

All endpoints except `/image/:imageID/file` require the `X-API-Key` header.

### Upload Image

```
POST /image/upload
Content-Type: multipart/form-data
X-API-Key: <your-api-key>

Form fields:
- file: The image file (required)
- tags: JSON array of tags (optional)
- description: Image description (optional)
- alt: Alt text (optional)
```

**Response:**
```json
{
  "ImageID": "550e8400-e29b-41d4-a716-446655440000",
  "AppID": "myapp",
  "FileName": "550e8400-e29b-41d4-a716-446655440000.png",
  "OriginalFileName": "photo.png",
  "MimeType": "image/png",
  "Size": 12345,
  "Tags": ["avatar"],
  "Description": "",
  "Alt": "",
  "Status": 1
}
```

### Get Image File (Public)

```
GET /image/:imageID/file
```

Returns the image file directly. **No authentication required.**

### Get Image Metadata

```
GET /image/:imageID
X-API-Key: <your-api-key>
```

### List Images

```
GET /image?page=1&limit=20&tags=avatar,profile&search=keyword
X-API-Key: <your-api-key>
```

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20, max: 100)
- `tags` - Comma-separated tags to filter by
- `search` - Search in description, alt text, and original filename

### Update Image Metadata

```
PATCH /image/:imageID
X-API-Key: <your-api-key>
Content-Type: application/json

{
  "tags": ["new", "tags"],
  "description": "Updated description",
  "alt": "Updated alt text"
}
```

### Delete Image

```
DELETE /image/:imageID
X-API-Key: <your-api-key>
```

Soft-deletes the image (sets status to deleted).

## Integration with Other Services

### Consuming Applications

Applications using this service should:

1. Obtain an API key via the CLI scripts
2. Set environment variables:
   ```env
   IMAGE_SERVICE_URL=http://localhost:3120
   IMAGE_API_KEY=img_xxxxxxxx...
   ```
3. Upload images via `POST /image/upload` with multipart/form-data
4. Store the returned `FileName` in their database
5. Serve images directly via `GET /image/:imageID/file` or configure a static file server pointing to `IMAGE_DIR`

### Example: Uploading from Node.js

```typescript
const blob = new Blob([imageBuffer], { type: 'image/png' });
const formData = new FormData();
formData.append('file', blob, 'upload.png');
formData.append('tags', JSON.stringify(['avatar', 'player:123']));

const response = await fetch('http://localhost:3120/image/upload', {
  method: 'POST',
  headers: { 'X-API-Key': process.env.IMAGE_API_KEY },
  body: formData
});

const image = await response.json();
// Store image.FileName in your database
```

## Migration Script

To migrate existing images from another application:

```bash
npm run migrate -- <sourceMongoUri> <sourceImageDir> <appName>
```

**Example:**
```bash
npm run migrate -- "mongodb+srv://..." "C:\path\to\images" primordia
```

The script will:
1. Read all image files from the source directory
2. Copy them to the image-service storage with new UUID filenames
3. Create database records in the image-service
4. Update the source database with new filenames

## File Storage Structure

Images are stored in `{IMAGE_DIR}/{AppID}/{ImageID}.{ext}`:

```
uploads/
  primordia/
    550e8400-e29b-41d4-a716-446655440000.png
    6ba7b810-9dad-11d1-80b4-00c04fd430c8.jpg
  otherapp/
    7c9e6679-7425-40de-944b-e07fc1f90ae7.webp
```

## Supported Image Types

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/gif`
- `image/svg+xml`

Maximum file size: 10MB
